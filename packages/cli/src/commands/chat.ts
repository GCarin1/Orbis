// `orbis chat @handle [message]` — one-shot or interactive, streaming the
// bot's steps and reply (specs/cli).
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import type { Bot, Conversation, Run, Step, StreamEvent, TimelineItem } from "@orbis/shared";
import type { HubClient } from "../client.js";
import type { CommandContext } from "../context.js";
import { UsageError, out, paint, type Io } from "../io.js";

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

/**
 * Send one message and stream until every run it started has ended.
 * Returns true when all runs finished successfully.
 */
export async function sendAndStream(
  io: Io,
  client: HubClient,
  bot: Bot,
  conversation: Conversation,
  text: string,
  opts: { json: boolean } = { json: false },
): Promise<boolean> {
  const c = paint(io);
  const pending = new Set<string>();
  const finished = new Map<string, Run["status"]>();
  const early: StreamEvent[] = [];
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolveDone = r));
  const botNames = new Map<string, string>([[bot.id, bot.handle]]);

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
      }
    } else if (event.type === "run.updated") {
      const run = (event.data as { run: Omit<Run, "steps"> }).run;
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
    for (const run of posted.runs) pending.add(run.id);
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

  if (words.length > 0) {
    const ok = await sendAndStream(ctx.io, client, bot, conversation, words.join(" "), { json: ctx.json });
    return ok ? 0 : 1;
  }

  if (!ctx.io.interactive) {
    // Piped input: the whole of stdin is one message.
    let text = "";
    for await (const chunk of ctx.io.stdin) text += chunk;
    if (!text.trim()) throw new UsageError("no message given and stdin is empty");
    const ok = await sendAndStream(ctx.io, client, bot, conversation, text.trim(), { json: ctx.json });
    return ok ? 0 : 1;
  }

  const c = paint(ctx.io);
  out(ctx.io, c.dim(`Chatting with ${bot.name} (@${bot.handle}) — ${bot.brain.kind}. Ctrl+D to leave.`));
  const rl = createInterface({ input: ctx.io.stdin, output: ctx.io.stdout, prompt: c.bold("you> ") });
  rl.prompt();
  let failures = 0;
  for await (const line of rl) {
    const text = line.trim();
    if (text) {
      rl.pause();
      const ok = await sendAndStream(ctx.io, client, bot, conversation, text);
      if (!ok) failures++;
      rl.resume();
    }
    rl.prompt();
  }
  out(ctx.io);
  return failures > 0 ? 1 : 0;
}
