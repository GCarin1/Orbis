// Bots working together as a team: team.handoff with one report back per
// delegating run, bot-to-bot mentions by handle or role in any conversation,
// the team section of every bot's context and the chain depth limit
// (specs/handoff, specs/conversations, specs/bots).
import Type from "typebox";
import { extractMentions, resolveMentions, roleSlug, type Bot, type Card, type HandoffCardData, type Run, type TimelineItem } from "@orbis/shared";
import type { HubContext } from "../context.js";
import type { RunHooks } from "../runs/engine.js";
import type { ToolDefinition } from "../tools/registry.js";

const TERMINAL = new Set(["done", "failed"]);
const COLLEAGUES_SHOWN = 30;

const label = (bot: Bot) => `@${bot.handle} (${bot.name}${bot.role ? `, ${bot.role}` : ""})`;

export class Collaboration {
  constructor(private readonly hub: HubContext) {}

  private get maxDepth(): number {
    return this.hub.config.maxHandoffDepth;
  }

  private team(): Bot[] {
    return this.hub.repos.bots.list({ includeHidden: true });
  }

  private depthExceeded(conversationId: string, from: Bot, to: Bot | null, depth: number): void {
    this.hub.timeline.event(
      conversationId,
      "handoff.depth_exceeded",
      `Stopped a chain of ${depth} bot-to-bot steps${to ? ` before @${to.handle}` : ""} (limit ${this.maxDepth}, ORBIS_MAX_HANDOFF_DEPTH).`,
      { from: from.id, to: to?.id ?? null, depth, limit: this.maxDepth },
    );
  }

  private setCard(itemId: string, state: string, patch: Partial<HandoffCardData>): void {
    const item = this.hub.repos.items.get(itemId);
    if (!item?.card || item.card.type !== "handoff") return;
    const card: Card = { type: "handoff", state, data: { ...item.card.data, ...patch } };
    this.hub.timeline.setCard(itemId, card);
  }

  private card(itemId: string | null): { item: TimelineItem; data: HandoffCardData } | null {
    if (!itemId) return null;
    const item = this.hub.repos.items.get(itemId);
    if (!item?.card || item.card.type !== "handoff") return null;
    return { item, data: item.card.data as HandoffCardData };
  }

  /** The one bot a handoff names: a handle, or a role only one bot holds. */
  private receiverOf(ref: string): Bot | string {
    const mention = ref.replace(/^@/, "").toLowerCase();
    const found = resolveMentions([mention], this.team());
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return `several bots have the role @${mention}: ${found.map((b) => `@${b.handle}`).sort().join(", ")}; name one handle`;
    return `no bot with the handle or role ${ref}`;
  }

  /** The `team.handoff` tool. */
  handoffTool(): ToolDefinition {
    return {
      name: "team.handoff",
      description:
        "Delegate a task to another bot of the team (by @handle, or by @role when one bot holds it), for example one of your reports. " +
        "It works on it asynchronously and answers in this conversation. Hand off several independent tasks in the same turn: once every " +
        "one of them has ended you get all their answers together as a new task, so you can tell the user the outcome. Do not wait for them. " +
        "Set returnResult to false only for work you do not need to hear back about.",
      input: Type.Object({
        to: Type.String({ minLength: 2, maxLength: 40, description: "the receiving bot's handle or role, e.g. @bob or @designer" }),
        task: Type.String({ minLength: 1, maxLength: 20_000 }),
        context: Type.Optional(Type.String({ maxLength: 20_000 })),
        returnResult: Type.Optional(Type.Boolean({ description: "default true: get the answer back with the rest of this turn's handoffs" })),
      }),
      risk: "write",
      handler: async (input: { to: string; task: string; context?: string; returnResult?: boolean }, ctx) => {
        const receiver = this.receiverOf(input.to);
        if (typeof receiver === "string") return { output: receiver, isError: true };
        if (receiver.id === ctx.bot.id) return { output: "you cannot hand a task to yourself", isError: true };
        const conversationId = ctx.run.conversationId;
        if (!conversationId) return { output: "a handoff needs a conversation to be shown in", isError: true };
        const depth = ctx.run.depth + 1;
        if (depth > this.maxDepth) {
          this.depthExceeded(conversationId, ctx.bot, receiver, depth);
          return { output: `the chain of bot-to-bot steps reached its limit (${this.maxDepth}); finish the work yourself or ask the user`, isError: true };
        }
        const data: HandoffCardData = {
          from: ctx.bot.id,
          to: receiver.id,
          task: input.task,
          context: input.context ?? null,
          returnResult: input.returnResult ?? true,
          receiverRunId: null,
        };
        const card = this.hub.timeline.post({
          conversationId,
          kind: "card",
          author: { type: "bot", id: ctx.bot.id },
          text: `@${ctx.bot.handle} → @${receiver.handle}: ${input.task}`,
          runId: ctx.run.id,
          card: { type: "handoff", state: "queued", data },
        });
        const task = [
          `${label(ctx.bot)} handed you this task:`,
          input.task,
          ...(input.context ? ["", `Context from @${ctx.bot.handle}:`, input.context] : []),
          "",
          `Do it and answer with the result; @${ctx.bot.handle} gets your answer.`,
        ].join("\n");
        const run = this.hub.engine.enqueue({
          botId: receiver.id,
          conversationId,
          trigger: { type: "handoff", ref: card.id },
          input: task,
          depth,
          replyParentId: card.id,
          includeHistory: false,
        });
        this.setCard(card.id, "queued", { receiverRunId: run.id });
        return `Handed off to @${receiver.handle} (handoff ${card.id}). It answers in this conversation${
          data.returnResult ? "; you get its answer back, with the rest of this turn's handoffs, as a new task" : ""
        }. Do not wait for it.`;
      },
    };
  }

  /** Who this bot works with, for its context (specs/bots: hierarchy). */
  contextSection(bot: Bot): string | null {
    const team = this.team().filter((b) => b.id !== bot.id);
    if (team.length === 0) return null;
    const manager = bot.reportsTo ? team.find((b) => b.id === bot.reportsTo) : undefined;
    const reports = team.filter((b) => b.reportsTo === bot.id);
    const others = team.filter((b) => b !== manager && !reports.includes(b));
    const lines = ["Your team:"];
    if (manager) lines.push(`- You report to ${label(manager)}.`);
    if (reports.length) lines.push(`- Your reports: ${reports.map(label).join("; ")}.`);
    if (others.length) {
      const shown = others.slice(0, COLLEAGUES_SHOWN).map(label).join("; ");
      lines.push(`- Colleagues: ${shown}${others.length > COLLEAGUES_SHOWN ? `; and ${others.length - COLLEAGUES_SHOWN} more (team.list_bots)` : ""}.`);
    }
    lines.push(
      "How the team works:",
      reports.length
        ? "- You lead your reports: split the user's request, delegate each part to the report whose role fits with team.handoff (several in one turn when they are independent), and do the rest yourself."
        : "- Delegate a part to a colleague with team.handoff when their role fits it better than yours.",
      "- Everything you delegate in one turn comes back to you together as a new task once all of it has ended; then tell the user the outcome. Do not wait for it or ask again.",
      "- Mention a colleague as @handle or @role in your reply to bring them into this conversation; they answer here.",
    );
    if (manager) lines.push(`- When @${manager.handle} hands you work, do it and answer with the result: it reaches @${manager.handle}.`);
    return lines.join("\n");
  }

  /** Card states, the report back and bot-to-bot mentions follow the runs. */
  hooks(): RunHooks {
    return {
      onStarted: (run) => {
        if (run.trigger.type !== "handoff") return;
        const card = this.card(run.trigger.ref);
        if (card && card.data.receiverRunId === run.id) this.setCard(card.item.id, "running", {});
      },
      onEnded: (run) => {
        if (run.trigger.type === "handoff") this.handoffEnded(run);
        if (run.status !== "done") return;
        if (run.trigger.type === "report") this.reported(run);
        else this.mentionsInReply(run);
      },
    };
  }

  private handoffEnded(run: Run): void {
    const card = this.card(run.trigger.ref);
    if (!card || card.data.receiverRunId !== run.id) return;
    if (run.status === "done") this.setCard(card.item.id, "done", {});
    else this.setCard(card.item.id, "failed", { error: run.error ?? run.status });
    this.reportWhenAllEnded(card.item, run);
  }

  /**
   * Once every handoff the sender's run made (with returnResult) has ended,
   * wake the sender once with every answer, so it can tell the user.
   */
  private reportWhenAllEnded(cardItem: TimelineItem, lastRun: Run): void {
    const senderRunId = cardItem.runId;
    if (!senderRunId) return;
    const batch = this.hub.repos.items
      .cardsOf(senderRunId)
      .filter((i) => i.card?.type === "handoff" && (i.card.data as HandoffCardData).returnResult);
    if (batch.length === 0 || batch.some((i) => !TERMINAL.has(i.card!.state))) return;
    if (batch.some((i) => (i.card!.data as HandoffCardData).reportRunId)) return;
    const first = batch[0]!.card!.data as HandoffCardData;
    const sender = this.hub.repos.bots.get(first.from);
    if (!sender) return;
    const depth = lastRun.depth + 1;
    if (depth > this.maxDepth) {
      this.depthExceeded(cardItem.conversationId, this.hub.repos.bots.get(first.to) ?? sender, sender, depth);
      return;
    }
    const parts = batch.map((item) => {
      const data = item.card!.data as HandoffCardData;
      const receiver = this.hub.repos.bots.get(data.to);
      const who = receiver ? label(receiver) : "a removed bot";
      if (item.card!.state === "failed") return `${who} — "${data.task}" — failed: ${data.error ?? "no answer"}`;
      const answer = data.receiverRunId ? (this.hub.repos.runs.get(data.receiverRunId)?.reply ?? "") : "";
      return `${who} — "${data.task}" — done. Answer:\n${answer}`;
    });
    const input = [
      batch.length === 1 ? "The task you handed off has ended." : `All ${batch.length} tasks you handed off have ended.`,
      "Tell the user the outcome in one message: what was done, what failed and what needs them. Do not hand the same tasks off again.",
      "",
      ...parts.flatMap((part) => [part, ""]),
    ]
      .join("\n")
      .trim();
    const report = this.hub.engine.enqueue({
      botId: sender.id,
      conversationId: cardItem.conversationId,
      trigger: { type: "report", ref: senderRunId },
      input,
      depth,
    });
    for (const item of batch) this.setCard(item.id, item.card!.state, { reportRunId: report.id, ...(batch.length === 1 ? { returnRunId: report.id } : {}) });
  }

  /** A manager reported back: tell every client, so the user hears about it wherever they are. */
  private reported(run: Run): void {
    if (!run.conversationId || !run.reply) return;
    const reply = this.hub.repos.items.replyOf(run.id);
    if (!reply) return;
    this.hub.bus.publish("bot.report", { botId: run.botId, conversationId: run.conversationId, itemId: reply.id, text: run.reply.slice(0, 500) });
  }

  /**
   * A bot reply that mentions other bots of the team (by handle or role)
   * starts their runs in the same conversation — except the bots this run
   * already handed work to, the bot that handed this run its task (its
   * answer reaches that bot in the report), and in a report to the user.
   */
  private mentionsInReply(run: Run): void {
    if (!run.conversationId || !run.reply) return;
    const conv = this.hub.repos.conversations.get(run.conversationId);
    if (!conv) return;
    const author = this.hub.repos.bots.get(run.botId);
    if (!author) return;
    const handedTo = new Set(
      this.hub.repos.items
        .cardsOf(run.id)
        .filter((i) => i.card?.type === "handoff")
        .map((i) => (i.card!.data as HandoffCardData).to),
    );
    if (run.trigger.type === "handoff") {
      const from = this.card(run.trigger.ref)?.data.from;
      if (from) handedTo.add(from);
    }
    const mentions = extractMentions(run.reply).filter((h) => h !== "everyone" && h !== author.handle && h !== roleSlug(author.role));
    const targets = resolveMentions(mentions, this.team()).filter((b) => b.id !== author.id && !handedTo.has(b.id));
    if (targets.length === 0) return;
    const reply = this.hub.repos.items.replyOf(run.id);
    const depth = run.depth + 1;
    if (depth > this.maxDepth) {
      this.depthExceeded(conv.id, author, targets[0]!, depth);
      return;
    }
    for (const target of targets) {
      this.hub.engine.enqueue({
        botId: target.id,
        conversationId: conv.id,
        trigger: { type: "mention", ref: reply?.id ?? null },
        input: `[@${author.handle}] ${run.reply}`,
        depth,
        triggerItemId: reply?.id ?? null,
      });
    }
  }
}
