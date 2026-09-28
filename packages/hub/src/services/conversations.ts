// Conversations and message routing (specs/conversations).
import { extractMentions, resolveMentions, type Bot, type Conversation, type Run, type TimelineItem } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import type { HubConfig } from "../config.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import type { BotsRepo } from "../repos/bots.js";
import type { ConversationsRepo, ItemsRepo } from "../repos/conversations.js";
import type { RunEngine } from "../runs/engine.js";
import type { BotService } from "./bots.js";
import type { Timeline } from "./timeline.js";

export interface PostMessageInput {
  text: string;
  parentId?: string | null;
  attachments?: string[];
}

/** Decides which runs a user message starts; groups extend this in the collaboration change. */
export interface MessageRouter {
  route(conversation: Conversation, item: TimelineItem): Run[];
}

/** How a message reaches one bot: plain text, a skill invocation, or a refused one. */
export type SkillResolution =
  | { kind: "none" }
  | { kind: "skill"; skill: { name: string; body: string }; input: string }
  | { kind: "unavailable"; name: string };

export type SkillResolver = (bot: Bot, text: string) => SkillResolution;

export interface ConversationServiceDeps {
  config: HubConfig;
  bus: EventBus;
  bots: BotsRepo;
  botService: BotService;
  conversations: ConversationsRepo;
  items: ItemsRepo;
  timeline: Timeline;
  engine: RunEngine;
}

export interface GroupInput {
  title: string;
  /** Bot ids or handles. */
  members: string[];
  leadBotId?: string | null;
}

export class ConversationService {
  private router: MessageRouter;
  private skillResolver: SkillResolver | null = null;

  constructor(private readonly d: ConversationServiceDeps) {
    this.router = {
      route: (conversation, item) =>
        conversation.kind === "direct" ? this.routeDirect(conversation, item) : this.routeGroup(conversation, item),
    };
  }

  setRouter(router: MessageRouter): void {
    this.router = router;
  }

  setSkillResolver(resolver: SkillResolver): void {
    this.skillResolver = resolver;
  }

  /** Start the bot's run for a user message, or post why a `/skill` cannot run. */
  private runFor(bot: Bot, conversation: Conversation, item: TimelineItem): Run | null {
    const resolved = this.skillResolver?.(bot, item.text) ?? { kind: "none" };
    if (resolved.kind === "unavailable") {
      this.d.timeline.event(conversation.id, "skill.unavailable", `@${bot.handle} is not offered the skill /${resolved.name}, so it did not run.`, {
        botId: bot.id,
        skill: resolved.name,
      });
      return null;
    }
    return this.d.engine.enqueue({
      botId: bot.id,
      conversationId: conversation.id,
      trigger: { type: "message", ref: item.id },
      input: resolved.kind === "skill" ? resolved.input : item.text,
      skill: resolved.kind === "skill" ? resolved.skill : null,
      triggerItemId: item.id,
      replyParentId: item.parentId,
    });
  }

  get(id: string): Conversation {
    const conv = this.d.conversations.get(id);
    if (!conv) throw notFound(`conversation ${id}`);
    return conv;
  }

  list(): Conversation[] {
    return this.d.conversations.list();
  }

  /** The bot's direct conversation, created on first request. */
  directFor(idOrHandle: string): Conversation {
    const bot = this.d.botService.get(idOrHandle);
    const existing = this.d.conversations.getDirect(bot.id);
    if (existing) return existing;
    const conv: Conversation = {
      id: newId("cnv"),
      kind: "direct",
      title: bot.name,
      members: [bot.id],
      leadBotId: bot.id,
      createdAt: nowIso(),
      lastItemAt: null,
    };
    this.d.conversations.insert(conv, bot.id);
    const saved = this.get(conv.id);
    this.d.bus.publish("conversation.updated", { conversation: saved });
    return saved;
  }

  // --- groups ----------------------------------------------------------------

  private group(id: string): Conversation {
    const conv = this.get(id);
    if (conv.kind !== "group") throw badRequest(`conversation ${id} is a direct conversation, not a group`);
    return conv;
  }

  private publish(id: string): Conversation {
    const saved = this.get(id);
    this.d.bus.publish("conversation.updated", { conversation: saved });
    return saved;
  }

  createGroup(input: GroupInput): Conversation {
    const title = input.title.trim();
    if (!title) throw badRequest("invalid group", { title: "must not be empty" });
    const members = [...new Set(input.members.map((m) => this.d.botService.get(m).id))];
    if (members.length < 2) throw badRequest("invalid group", { members: "a group needs at least 2 different bots" });
    if (members.length > this.d.config.maxGroupSize) {
      throw conflict("group_full", `a group holds at most ${this.d.config.maxGroupSize} bots (ORBIS_MAX_GROUP_SIZE)`);
    }
    const lead = input.leadBotId ? this.d.botService.get(input.leadBotId).id : members[0]!;
    if (!members.includes(lead)) throw badRequest("invalid group", { leadBotId: "the lead must be a member" });
    const conv: Conversation = {
      id: newId("cnv"),
      kind: "group",
      title,
      members,
      leadBotId: lead,
      createdAt: nowIso(),
      lastItemAt: null,
    };
    this.d.conversations.insert(conv, null);
    return this.publish(conv.id);
  }

  updateGroup(id: string, patch: { title?: string; leadBotId?: string | null }): Conversation {
    const conv = this.group(id);
    const next: { title?: string; leadBotId?: string | null } = {};
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw badRequest("invalid group", { title: "must not be empty" });
      next.title = patch.title.trim();
    }
    if (patch.leadBotId !== undefined) {
      const lead = patch.leadBotId === null ? conv.members[0]! : this.d.botService.get(patch.leadBotId).id;
      if (!conv.members.includes(lead)) throw badRequest("invalid group", { leadBotId: "the lead must be a member" });
      next.leadBotId = lead;
    }
    this.d.conversations.update(id, next);
    return this.publish(id);
  }

  deleteGroup(id: string): void {
    this.group(id);
    this.d.conversations.delete(id);
    this.d.bus.publish("conversation.deleted", { conversationId: id });
  }

  addMember(id: string, botRef: string): Conversation {
    const conv = this.group(id);
    const bot = this.d.botService.get(botRef);
    if (conv.members.includes(bot.id)) throw conflict("already_member", `@${bot.handle} is already in this group`);
    if (conv.members.length >= this.d.config.maxGroupSize) {
      throw conflict("group_full", `a group holds at most ${this.d.config.maxGroupSize} bots (ORBIS_MAX_GROUP_SIZE)`);
    }
    this.d.conversations.addMember(id, bot.id);
    return this.publish(id);
  }

  removeMember(id: string, botRef: string): Conversation {
    const conv = this.group(id);
    const bot = this.d.botService.get(botRef);
    if (!conv.members.includes(bot.id)) throw notFound(`@${bot.handle} in this group`);
    if (conv.members.length <= 2) throw conflict("group_too_small", "a group needs at least 2 bots; delete the group instead");
    this.d.conversations.removeMember(id, bot.id);
    if (conv.leadBotId === bot.id) this.d.conversations.update(id, { leadBotId: conv.members.find((m) => m !== bot.id)! });
    return this.publish(id);
  }

  items(conversationId: string, opts: { before?: string; limit?: number }): TimelineItem[] {
    this.get(conversationId);
    return this.d.items.list(conversationId, opts);
  }

  postUserMessage(conversationId: string, input: PostMessageInput): { item: TimelineItem; runs: Run[] } {
    const conversation = this.get(conversationId);
    const text = input.text.trim();
    const attachments = input.attachments ?? [];
    if (!text && attachments.length === 0) {
      throw badRequest("empty message", { text: "must not be empty when there is no attachment" });
    }
    if (input.parentId) {
      const parent = this.d.items.get(input.parentId);
      if (!parent || parent.conversationId !== conversationId) {
        throw badRequest("invalid parent", { parentId: "must be an item of this conversation" });
      }
    }
    const item = this.d.timeline.post({
      conversationId,
      kind: "message",
      author: { type: "user", id: null },
      text,
      parentId: input.parentId ?? null,
      mentions: extractMentions(text),
      attachments,
    });
    return { item, runs: this.router.route(conversation, item) };
  }

  /** The bots of the team a message mentions, by handle or by role (`@qa`). */
  private mentioned(item: TimelineItem): Bot[] {
    const mentions = item.mentions.filter((m) => m !== "everyone");
    return mentions.length ? resolveMentions(mentions, this.d.bots.list({ includeHidden: true })) : [];
  }

  /**
   * Direct conversation: the conversation's own bot answers every message and
   * coordinates; it brings in the colleagues the user mentions by delegating
   * to them or mentioning them in its reply.
   */
  routeDirect(conversation: Conversation, item: TimelineItem): Run[] {
    if (conversation.kind !== "direct") return [];
    const bot = conversation.members[0] ? this.d.bots.get(conversation.members[0]) : undefined;
    if (!bot) return [];
    const run = this.runFor(bot, conversation, item);
    return run ? [run] : [];
  }

  /**
   * Group: `@everyone` runs every member; the bots mentioned by handle or role
   * run, members or not; with no mention the lead runs.
   */
  routeGroup(conversation: Conversation, item: TimelineItem): Run[] {
    const members = conversation.members
      .map((id) => this.d.bots.get(id))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);
    let targets = item.mentions.includes("everyone") ? members : this.mentioned(item);
    if (targets.length === 0) {
      const lead = members.find((b) => b.id === conversation.leadBotId) ?? members[0];
      targets = lead ? [lead] : [];
    }
    return targets.map((bot) => this.runFor(bot, conversation, item)).filter((run): run is Run => run !== null);
  }

  /** The user read the conversation: a bot that was `done` goes back to `idle`. */
  markRead(conversationId: string): void {
    const conv = this.get(conversationId);
    for (const botId of conv.members) {
      const bot = this.d.bots.get(botId);
      if (bot?.state === "done") this.d.engine.setBotState(botId, "idle");
    }
  }

  react(itemId: string, emoji: string, add: boolean): TimelineItem {
    if (!this.d.items.get(itemId)) throw notFound(`item ${itemId}`);
    return this.d.timeline.react(itemId, emoji, "user", add);
  }
}
