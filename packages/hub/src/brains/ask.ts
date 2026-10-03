// One question to a brain, outside any conversation (specs/agent-runtimes): no tools, no history, a scratch
// workspace. The brain test asks it the fixed question; hiring asks it for résumés and profiles.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import type { Bot, Usage } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { NO_TOOLS, type BrainAdapter, type BrainEvent } from "./types.js";

export interface AskOptions {
  config: HubConfig;
  /** The bot's secret resolver (API keys); none for a brain asked on its own. */
  secret?: (name: string) => string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** The scratch folder's prefix under `<data>/brain-tests/`. */
  scratch?: string;
}

export interface AskResult {
  /** What the brain answered (its final reply, or its text when it gave none). */
  reply: string;
  /** Why it did not answer; null when it did. */
  error: string | null;
  usage: Usage;
  durationMs: number;
}

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscription: false };

/** Ask `bot`'s brain one task with `identity` as its system prompt; never throws. */
export async function askBrain(adapter: BrainAdapter, bot: Bot, task: string, identity: string, opts: AskOptions): Promise<AskResult> {
  const started = Date.now();
  const secret = opts.secret ?? (() => null);
  const usage: Usage = { ...NO_USAGE };
  const done = (reply: string, error: string | null): AskResult => ({ reply, error, usage, durationMs: Date.now() - started });

  const missing = adapter.check(bot, opts.config, secret);
  if (missing) return done("", missing);

  // A scratch workspace: the question never touches the bot's computer.
  const root = path.join(opts.config.dataDir, "brain-tests");
  mkdirSync(root, { recursive: true });
  const workspaceDir = mkdtempSync(path.join(root, `${opts.scratch ?? bot.brain.kind}-`));
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  let session: string | null = null;

  const texts: string[] = [];
  let reply: string | null = null;
  let error: string | null = null;
  try {
    const events = adapter.run(
      {
        runId: `ask-${bot.id}`,
        bot,
        conversationId: null,
        task,
        context: { identity, memories: [], history: [], since: null },
        skill: null,
      },
      {
        signal: controller.signal,
        workspaceDir,
        timeoutMs,
        sessions: { get: () => session, set: (id) => (session = id), clear: () => (session = null) },
        tools: NO_TOOLS,
        config: opts.config,
        mcp: null,
        secret,
      },
    );
    for await (const ev of events as AsyncIterable<BrainEvent>) {
      if (ev.type === "step.text") texts.push(ev.text);
      else if (ev.type === "run.finished") reply = ev.reply;
      else if (ev.type === "run.failed") error = ev.error;
      else if (ev.type === "run.usage") {
        usage.inputTokens += ev.inputTokens;
        usage.outputTokens += ev.outputTokens;
        usage.cachedTokens += ev.cachedTokens;
        usage.costUsd += ev.costUsd;
        usage.subscription ||= ev.subscription;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  if (controller.signal.aborted && !error) error = opts.signal?.aborted ? "cancelled" : `timed out after ${Math.round(timeoutMs / 1000)}s`;
  return done((reply || texts.join("\n")).trim(), error);
}
