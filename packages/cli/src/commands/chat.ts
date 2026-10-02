// `orbis chat @handle [message]` — one-shot or interactive, streaming the
// bot's steps and reply (specs/cli).
import { parseArgs } from "node:util";
import type { Approval, Bot, Conversation, Run, Step, StreamEvent, TimelineItem } from "@orbis/shared";
import type { HubClient } from "../client.js";
import type { CommandContext } from "../context.js";
import { UsageError, out, paint, type Io } from "../io.js";
import { Prompter } from "../prompter.js";

const clip = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Hooks the chat loop calls while a run waits for the user (approvals arrive in change 0002). */
export interface ChatHooks {
  onEvent?(event: StreamEvent, io: Io, client: HubClient): Promise<void> | void;
}

const extraHooks: ChatHooks[] = [];
export function addChatHooks(hooks: ChatHooks): void {
  extraHooks.push(hooks);
}

function printStep(io: Io, step: Step, handle: string): void {
  const c = paint(io);
  switch (step.type) {
    case "thinking":
      out(io, c.dim(`  · ${clip(step.text ?? "")}`));
      break;
    case "tool_call":
      out(io, c.cyan(`  → ${step.tool} ${clip(JSON.stringify(step.input ?? {}), 160)}`));
      break;
    case "tool_result":
      out(io, (step.isError ? c.red : c.dim)(`  ← ${clip((step.output ?? "").replace(/\s+/g, " "), 200)}`));
      break;
    case "text":
      break;
  }
  void handle;
}

const DECISIONS: Record<string, "allow_once" | "allow_always" | "deny"> = {
  o: "allow_once",
  once: "allow_once",
  y: "allow_once",
  a: "allow_always",
  always: "allow_always",
  d: "deny",
  n: "deny",
  deny: "deny",
};

/** Ask the user about a pending approval on the terminal and send the answer. */
async function answerApproval(io: Io, client: HubClient, prompter: Prompter, approval: Approval, handle: string): Promise<void> {
  const c = paint(io);
  out(io, c.yellow(`  ? @${handle} wants to use ${c.bold(approval.tool)} ${clip(JSON.stringify(approval.input ?? {}), 200)}`));
  for (;;) {
    const answer = await prompter.ask("    allow [o]nce, [a]lways, or [d]eny? ");
    if (answer === null) return;
    const decision = DECISIONS[answer.trim().toLowerCase()];
    if (!decision) continue;
    let note: string | null = null;
    if (decision === "deny") note = ((await prompter.ask("    note for the bot (optional): ")) ?? "").trim() || null;
    try {
      await client.post(`/api/v1/approvals/${approval.id}`, { decision, ...(note ? { note } : {}) });
      out(io, c.dim(`    → ${decision.replace("_", " ")}`));
    } catch (err) {
      out(io, c.red(`    could not answer: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }
}

/** Runs a bot starts on its own in the conversation (a handoff, a mention, a report back) that the chat follows. */
const FOLLOWED_TRIGGERS = new Set(["handoff", "mention", "report"]);

/**
 * Send one message and stream until every run it started has ended, and
 * every run those runs started in the same conversation (handoffs, mentions).
 * Returns true when all runs finished successfully.
 */
export async function sendAndStream(
  io: Io,
  client: HubClient,
  bots: Bot[],
  conversation: Conversation,
  text: string,
  opts: { json: boolean; prompter?: Prompter | null } = { json: false },
): Promise<boolean> {
  const c = paint(io);
  const pending = new Set<string>();
  /** The chains this message started: only their runs are followed, not another message's. */
  const chains = new Set<string>();
  const finished = new Map<string, Run["status"]>();
  const early: StreamEvent[] = [];
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolveDone = r));
  const botNames = new Map<string, string>(bots.map((b) => [b.id, b.handle]));
  const shownCards = new Set<string>();

  const handle = async (event: StreamEvent) => {
    for (const hooks of extraHooks) await hooks.onEvent?.(event, io, client);
    if (event.type === "run.step") {
      const data = event.data as { runId: string; botId: string; step: Step };
      if (!pending.has(data.runId)) return;
      if (!opts.json) printStep(io, data.step, botNames.get(data.botId) ?? "bot");
    } else if (event.type === "timeline.item") {
      const item = (event.data as { item: TimelineItem }).item;
      if (!item.runId || !pending.has(item.runId)) return;
      if (item.kind === "message" && item.author.type === "bot") {
        if (opts.json) out(io, JSON.stringify(item));
        else out(io, `${c.bold(`@${botNames.get(item.author.id ?? "") ?? "bot"}`)}: ${item.text}`);
      } else if (item.kind === "event" && !opts.json) {
        out(io, c.yellow(`  ! ${item.text}`));
      } else if (item.kind === "card" && item.card?.type === "handoff" && !shownCards.has(item.id)) {
        shownCards.add(item.id);
        if (!opts.json) out(io, c.cyan(`  ⇢ ${clip(item.text.replace(/\s+/g, " "), 200)}`));
      }
    } else if (event.type === "approval.requested") {
      const approval = (event.data as { approval: Approval }).approval;
      if (!pending.has(approval.runId)) return;
      if (opts.prompter) await answerApproval(io, client, opts.prompter, approval, botNames.get(approval.botId) ?? "bot");
      else out(io, c.yellow(`  ? waiting for approval ${approval.id} (${approval.tool}) — orbis approvals allow ${approval.id}`));
    } else if (event.type === "run.updated") {
      const run = (event.data as { run: Omit<Run, "steps"> }).run;
      const ours = run.chainId ? chains.has(run.chainId) : run.conversationId === conversation.id;
      if (!pending.has(run.id) && run.status === "queued" && ours && FOLLOWED_TRIGGERS.has(run.trigger.type)) {
        pending.add(run.id);
      }
      if (!pending.has(run.id)) return;
      if (["done", "failed", "cancelled"].includes(run.status)) {
        finished.set(run.id, run.status);
        if (run.status !== "done" && run.error && !opts.json) out(io, c.red(`  ✗ ${run.error}`));
        if (finished.size === pending.size) resolveDone();
      }
    }
  };

  // Events that arrive before the POST returns the run ids are replayed after.
  let known = false;
  const stream = await client.stream([conversation.id], (event) => {
    if (!known) early.push(event);
    else void handle(event);
  });
  try {
    const posted = await client.post<{ item: TimelineItem; runs: Run[] }>(
      `/api/v1/conversations/${conversation.id}/messages`,
      { text },
    );
    for (const run of posted.runs) {
      pending.add(run.id);
      if (run.chainId) chains.add(run.chainId);
    }
    known = true;
    for (const event of early.splice(0)) await handle(event);
    if (pending.size === 0) return true;
    if (finished.size === pending.size) resolveDone();
    await done;
  } finally {
    stream.close();
  }
  return [...finished.values()].every((s) => s === "done");
}

export async function chatCommand(args: string[], ctx: CommandContext): Promise<number> {
  const { positionals } = parseArgs({ args, allowPositionals: true, strict: true });
  const [target, ...words] = positionals;
  if (!target) throw new UsageError('chat needs a bot: orbis chat @ana "hello"');
  const client = ctx.client();
  const bot = await client.get<Bot>(`/api/v1/bots/${encodeURIComponent(target.replace(/^@/, ""))}`);
  const conversation = await client.get<Conversation>(`/api/v1/bots/${bot.id}/conversation`);
  return converse(ctx, conversation, words, `Chatting with ${bot.name} (@${bot.handle}) — ${bot.brain.kind}.`);
}

/**
 * Talk in a conversation: one message from the arguments, the whole of a piped
 * stdin, or an interactive session on a terminal. Exit status 1 when a run failed.
 */
export async function converse(ctx: CommandContext, conversation: Conversation, words: string[], intro: string): Promise<number> {
  const client = ctx.client();
  const bots = await client.get<Bot[]>("/api/v1/bots?includeHidden=true");

  if (words.length > 0) {
    const prompter = ctx.io.interactive ? new Prompter(ctx.io) : null;
    try {
      const ok = await sendAndStream(ctx.io, client, bots, conversation, words.join(" "), { json: ctx.json, prompter });
      return ok ? 0 : 1;
    } finally {
      prompter?.close();
    }
  }

  if (!ctx.io.interactive) {
    // Piped input: the whole of stdin is one message.
    let text = "";
    for await (const chunk of ctx.io.stdin) text += chunk;
    if (!text.trim()) throw new UsageError("no message given and stdin is empty");
    const ok = await sendAndStream(ctx.io, client, bots, conversation, text.trim(), { json: ctx.json });
    return ok ? 0 : 1;
  }

  const c = paint(ctx.io);
  out(ctx.io, c.dim(`${intro} Ctrl+D to leave.`));
  const prompter = new Prompter(ctx.io);
  let failures = 0;
  try {
    for (;;) {
      const line = await prompter.ask(c.bold("you> "));
      if (line === null) break;
      const text = line.trim();
      if (!text) continue;
      const ok = await sendAndStream(ctx.io, client, bots, conversation, text, { json: false, prompter });
      if (!ok) failures++;
    }
  } finally {
    prompter.close();
  }
  out(ctx.io);
  return failures > 0 ? 1 : 0;
}
