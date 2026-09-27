// Bots working together: team.handoff, bot-to-bot mentions in groups and the
// chain depth limit (specs/handoff, specs/conversations).
import Type from "typebox";
import { extractMentions, type Bot, type Card, type HandoffCardData, type Run } from "@orbis/shared";
import type { HubContext } from "../context.js";
import type { RunHooks } from "../runs/engine.js";
import type { ToolDefinition } from "../tools/registry.js";

export class Collaboration {
  constructor(private readonly hub: HubContext) {}

  private get maxDepth(): number {
    return this.hub.config.maxHandoffDepth;
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

  private card(itemId: string | null): { id: string; data: HandoffCardData } | null {
    if (!itemId) return null;
    const item = this.hub.repos.items.get(itemId);
    if (!item?.card || item.card.type !== "handoff") return null;
    return { id: item.id, data: item.card.data as HandoffCardData };
  }

  /** The `team.handoff` tool. */
  handoffTool(): ToolDefinition {
    return {
      name: "team.handoff",
      description:
        "Hand a task to another bot of the team. It works on it asynchronously and answers in this conversation; with returnResult you get its answer back as a new task. Do not wait for it.",
      input: Type.Object({
        to: Type.String({ minLength: 2, maxLength: 40, description: "the receiving bot's handle, e.g. @bob" }),
        task: Type.String({ minLength: 1, maxLength: 20_000 }),
        context: Type.Optional(Type.String({ maxLength: 20_000 })),
        returnResult: Type.Optional(Type.Boolean()),
      }),
      risk: "write",
      handler: async (input: { to: string; task: string; context?: string; returnResult?: boolean }, ctx) => {
        const receiver = this.hub.repos.bots.get(input.to.replace(/^@/, ""));
        if (!receiver) return { output: `no bot with the handle ${input.to}`, isError: true };
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
          returnResult: input.returnResult ?? false,
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
          `@${ctx.bot.handle} (${ctx.bot.name}${ctx.bot.role ? `, ${ctx.bot.role}` : ""}) handed you this task:`,
          input.task,
          ...(input.context ? ["", `Context from @${ctx.bot.handle}:`, input.context] : []),
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
          data.returnResult ? "; its result will come back to you as a new task" : ""
        }. Do not wait for it.`;
      },
    };
  }

  /** Card states, returned results and bot-to-bot mentions follow the runs. */
  hooks(): RunHooks {
    return {
      onStarted: (run) => {
        if (run.trigger.type !== "handoff") return;
        const card = this.card(run.trigger.ref);
        if (card && card.data.receiverRunId === run.id) this.setCard(card.id, "running", {});
      },
      onEnded: (run) => {
        if (run.trigger.type === "handoff") this.handoffEnded(run);
        if (run.status === "done") this.mentionsInReply(run);
      },
    };
  }

  private handoffEnded(run: Run): void {
    const card = this.card(run.trigger.ref);
    if (!card || card.data.receiverRunId !== run.id) return;
    if (run.status !== "done") {
      this.setCard(card.id, "failed", { error: run.error ?? run.status });
      return;
    }
    this.setCard(card.id, "done", {});
    if (!card.data.returnResult || !run.conversationId) return;
    const sender = this.hub.repos.bots.get(card.data.from);
    const receiver = this.hub.repos.bots.get(card.data.to);
    if (!sender) return;
    const depth = run.depth + 1;
    if (depth > this.maxDepth) {
      this.depthExceeded(run.conversationId, receiver ?? sender, sender, depth);
      return;
    }
    const back = this.hub.engine.enqueue({
      botId: sender.id,
      conversationId: run.conversationId,
      trigger: { type: "handoff", ref: card.id },
      input: `@${receiver?.handle ?? "bot"} finished the task you handed off ("${card.data.task}"). Its answer:\n${run.reply ?? ""}`,
      depth,
      replyParentId: card.id,
    });
    this.setCard(card.id, "done", { returnRunId: back.id });
  }

  /** A bot reply in a group that mentions other members starts their runs. */
  private mentionsInReply(run: Run): void {
    if (!run.conversationId || !run.reply) return;
    const conv = this.hub.repos.conversations.get(run.conversationId);
    if (!conv || conv.kind !== "group") return;
    const author = this.hub.repos.bots.get(run.botId);
    if (!author) return;
    const handles = extractMentions(run.reply).filter((h) => h !== "everyone" && h !== author.handle);
    const targets = conv.members
      .map((id) => this.hub.repos.bots.get(id))
      .filter((b): b is Bot => b !== undefined && handles.includes(b.handle));
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
