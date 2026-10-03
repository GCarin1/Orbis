// The brain test (specs/agent-runtimes): ask a brain one fixed question with no
// tools and no history, and report whether a model answered it.
import { BRAIN_TEST_ANSWER, BRAIN_TEST_QUESTION, type Bot, type BrainTestResult } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { askBrain } from "./ask.js";
import type { BrainAdapter } from "./types.js";

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
  const identity = `You are ${bot.name}, a bot in Orbis. This is a connection test: answer the question directly, without tools.`;
  const answer = await askBrain(adapter, bot, BRAIN_TEST_QUESTION, identity, opts);
  const ok = answer.error === null;
  return {
    kind: bot.brain.kind,
    ok,
    reply: answer.reply,
    error: answer.error,
    durationMs: answer.durationMs,
    answered: ok && ANSWER.test(answer.reply),
  };
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
