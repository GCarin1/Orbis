// Conversations and message routing (specs/conversations).
import { extractMentions, type Conversation, type Run, type TimelineItem } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import type { HubConfig } from "../config.js";
import { badRequest, notFound } from "../errors.js";
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

export class ConversationService {
  private router: MessageRouter;

  constructor(private readonly d: ConversationServiceDeps) {
    this.router = { route: (conversation, item) => this.routeDirect(conversation, item) };
  }

  setRouter(router: MessageRouter): void {
    this.router = router;
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

  /** Direct conversation: every message runs the conversation's single bot. */
  routeDirect(conversation: Conversation, item: TimelineItem): Run[] {
    if (conversation.kind !== "direct") return [];
    const botId = conversation.members[0];
    if (!botId) return [];
    return [
      this.d.engine.enqueue({
        botId,
        conversationId: conversation.id,
        trigger: { type: "message", ref: item.id },
        input: item.text,
        triggerItemId: item.id,
        replyParentId: item.parentId,
      }),
    ];
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
