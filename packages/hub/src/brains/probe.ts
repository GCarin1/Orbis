// The brain test (specs/agent-runtimes): ask a brain one fixed question with no
// tools and no history, and report whether a model answered it.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { BRAIN_TEST_ANSWER, BRAIN_TEST_QUESTION, type Bot, type BrainTestResult } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { NO_TOOLS, type BrainAdapter, type BrainEvent } from "./types.js";

export interface BrainTestOptions {
  config: HubConfig;
  /** The bot's secret resolver (API keys); none for a brain tested on its own. */
  secret?: (name: string) => string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const ANSWER = new RegExp(`(^|\\D)${BRAIN_TEST_ANSWER}(\\D|$)`);

/** Run the test question through `adapter` for `bot` (its brain configuration and name). */
export async function testBrain(adapter: BrainAdapter, bot: Bot, opts: BrainTestOptions): Promise<BrainTestResult> {
  const started = Date.now();
  const secret = opts.secret ?? (() => null);
  const result = (fields: Partial<BrainTestResult>): BrainTestResult => {
    const reply = fields.reply ?? "";
    return {
      kind: bot.brain.kind,
      ok: fields.ok ?? false,
      reply,
      error: fields.error ?? null,
      durationMs: Date.now() - started,
      answered: fields.ok === true && ANSWER.test(reply),
    };
  };

  const missing = adapter.check(bot, opts.config, secret);
  if (missing) return result({ error: missing });

  // A scratch workspace: the test never touches the bot's computer.
  const root = path.join(opts.config.dataDir, "brain-tests");
  mkdirSync(root, { recursive: true });
  const workspaceDir = mkdtempSync(path.join(root, `${bot.brain.kind}-`));
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
        runId: "brain-test",
        bot,
        conversationId: null,
        task: BRAIN_TEST_QUESTION,
        context: {
          identity: `You are ${bot.name}, a bot in Orbis. This is a connection test: answer the question directly, without tools.`,
          memories: [],
          history: [],
          since: null,
        },
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
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  if (controller.signal.aborted && !error) error = opts.signal?.aborted ? "cancelled" : `timed out after ${Math.round(timeoutMs / 1000)}s`;
  const text = (reply || texts.join("\n")).trim();
  if (error) return result({ error, reply: text });
  return result({ ok: true, reply: text });
}

/** A stand-in bot for testing a brain configuration that no bot uses yet. */
export function brainTestBot(brain: Bot["brain"]): Bot {
  const now = new Date(0).toISOString();
  return {
    id: "brain-test",
    handle: "brain-test",
    name: "Orbis",
    role: "connection test",
    description: "",
    avatar: { initials: "OR", color: "#6d5dfc", shape: "orb" },
    brain,
    reportsTo: null,
    policy: { rules: [], grants: [] },
    computer: { enabled: false },
    tools: [],
    skills: [],
    spendCapUsd: null,
    capIncludesSubscription: false,
    pinned: false,
    hidden: true,
    state: "idle",
    lastMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}
