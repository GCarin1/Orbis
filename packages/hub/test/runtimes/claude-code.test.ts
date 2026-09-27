// specs/agent-runtimes — acceptance criterion 4 (claude-code adapter), replayed
// from a fake executable per contracts/cli-harnesses.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { claudeArgs, mapClaudeMessage, type ClaudeStreamState } from "../../src/brains/claude-code.js";
import { createBot, FIXTURES, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const fakeClaude = { kind: "claude-code", command: process.execPath, args: [path.join(FIXTURES, "fake-claude.mjs")] };

describe("claude-code brain", () => {
  it("builds the headless argv with stream-json, the identity, and a new session id", () => {
    const args = claudeArgs({ prompt: "do it", system: "You are Ana", model: "sonnet", sessionId: "s-1", resume: false, mcp: null });
    expect(args).toEqual([
      "-p", "do it", "--output-format", "stream-json", "--verbose", "--append-system-prompt", "You are Ana",
      "--model", "sonnet", "--session-id", "s-1",
    ]);
    expect(claudeArgs({ prompt: "x", system: "y", sessionId: "s-1", resume: true, mcp: null }).slice(-2)).toEqual(["--resume", "s-1"]);
  });

  it("maps stream-json messages to normalized events and ignores unknown types", () => {
    const state: ClaudeStreamState = { sessionId: null, toolNames: new Map(), finished: false };
    expect(mapClaudeMessage({ type: "rate_limit_event", session_id: "abc" }, state)).toEqual([]);
    expect(state.sessionId).toBe("abc");
    expect(mapClaudeMessage({ type: "system", subtype: "init", session_id: "abc" }, state)).toEqual([{ type: "run.started", sessionId: "abc" }]);
    const tool = mapClaudeMessage(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "a" } }] } },
      state,
    );
    expect(tool).toEqual([{ type: "step.tool_call", callId: "t1", tool: "Read", input: { path: "a" } }]);
    const result = mapClaudeMessage({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: true }] } }, state);
    expect(result).toEqual([{ type: "step.tool_result", callId: "t1", tool: "Read", output: "ok", isError: true }]);
    const end = mapClaudeMessage({ type: "result", subtype: "error_max_turns", is_error: true, result: "too long", usage: {} }, state);
    expect(end.at(-1)).toEqual({ type: "run.failed", error: "too long" });
  });

  it("runs through a fake Claude Code, stores the session and resumes it on the next run (criterion 4)", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeClaude });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;

    const first = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "list the files" });
    const run1 = await t.hub.engine.wait(first.body.runs[0].id);
    expect(run1.status).toBe("done");
    expect(run1.reply).toBe("turn 1: list the files");
    expect(run1.steps.map((s) => s.type)).toEqual(["thinking", "tool_call", "tool_result", "text"]);
    expect(run1.steps[1]).toMatchObject({ tool: "Bash", input: { command: "ls" } });
    expect(run1.steps[2]).toMatchObject({ output: "README.md", isError: false });
    expect(run1.usage).toEqual({ inputTokens: 105, outputTokens: 20, cachedTokens: 50, costUsd: 0.0123, subscription: true });

    const workspace = t.hub.computer.workspaceDir(bot.id);
    const argv1 = JSON.parse(readFileSync(path.join(workspace, "fake-claude-argv.json"), "utf8")) as string[];
    expect(argv1).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--verbose", "--append-system-prompt", "--session-id"]));
    const session = argv1[argv1.indexOf("--session-id") + 1];
    expect(argv1[argv1.indexOf("--append-system-prompt") + 1]).toContain("You are Ana (@ana)");

    const second = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "and now?" });
    const run2 = await t.hub.engine.wait(second.body.runs[0].id);
    expect(run2.reply).toBe("turn 2: and now?");
    const argv2 = JSON.parse(readFileSync(path.join(workspace, "fake-claude-argv.json"), "utf8")) as string[];
    expect(argv2[argv2.indexOf("--resume") + 1]).toBe(session);
    // A resumed session already holds the earlier turns: the prompt carries only what is new.
    expect(argv2[argv2.indexOf("-p") + 1]).not.toContain("list the files");
  });

  it("starts a new session when the stored one no longer exists", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeClaude });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    t.hub.repos.sessions.set(bot.id, conv.id, "claude-code", "gone-session");
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "hello" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("done");
    expect(t.hub.repos.sessions.get(bot.id, conv.id, "claude-code")).not.toBe("gone-session");
  });

  it("fails the run with the exit status and stderr when Claude Code exits non-zero", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeClaude });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "EXIT_WITH_ERROR" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/exit code 3: fatal: the model is unavailable/);
  });

  it("fails fast when the executable is missing", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: { kind: "claude-code", command: "definitely-not-claude-xyz" } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "hi" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.error).toMatch(/executable "definitely-not-claude-xyz" not found/);
  });
});
