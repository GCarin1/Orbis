// specs/agent-runtimes — acceptance criterion 4 (claude-code adapter), replayed
// from a fake executable per contracts/cli-harnesses.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      "-p", "do it", "--output-format", "stream-json", "--verbose",
      "--disallowedTools", "RemoteTrigger,CronCreate,CronDelete,CronList,ScheduleWakeup",
      "--append-system-prompt", "You are Ana",
      "--model", "sonnet", "--session-id", "s-1",
    ]);
    // Claude Code's own schedulers stay off, and its variadic list never swallows the prompt.
    const long = claudeArgs({ prompt: null, system: "y", sessionId: "s-1", resume: false, mcp: null });
    expect(long[long.indexOf("--disallowedTools") + 2]).toBe("--append-system-prompt");
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
    const hubUrl = await t.hub.listen();
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
    // Wired to the Orbis tool gateway through the stdio bridge, with a run token only.
    const mcpConfig = JSON.parse(argv1[argv1.indexOf("--mcp-config") + 1]!);
    expect(mcpConfig.mcpServers.orbis).toMatchObject({ type: "stdio", command: process.execPath, env: { ORBIS_URL: hubUrl } });
    expect(mcpConfig.mcpServers.orbis.args[0]).toMatch(/mcp-bridge\.js$/);
    expect(mcpConfig.mcpServers.orbis.env.ORBIS_RUN_TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(argv1).toContain("--strict-mcp-config");
    expect(argv1[argv1.indexOf("--permission-prompt-tool") + 1]).toBe("mcp__orbis__approval_prompt");
    expect(argv1[argv1.indexOf("--append-system-prompt") + 1]).toContain("You are Ana (@ana)");

    const second = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "and now?" });
    const run2 = await t.hub.engine.wait(second.body.runs[0].id);
    expect(run2.reply).toBe("turn 2: and now?");
    const argv2 = JSON.parse(readFileSync(path.join(workspace, "fake-claude-argv.json"), "utf8")) as string[];
    expect(argv2[argv2.indexOf("--resume") + 1]).toBe(session);
    // A resumed session already holds the earlier turns: the prompt carries only what is new.
    expect(argv2[argv2.indexOf("-p") + 1]).not.toContain("list the files");
  });

  it("finds the offered skills under .claude/skills in its workspace, and loses the ones no longer offered (skills criterion 4)", async () => {
    t = await testHub();
    const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\nSteps for ${name}.\n`;
    await t.api("POST", "/api/v1/skills", { content: skill("release-notes", "Write release notes") });
    await t.api("POST", "/api/v1/skills", { content: skill("secret-ops", "Not for Ana") });
    const bot = await createBot(t, { brain: fakeClaude, skills: ["release-*"] });
    await t.api("POST", "/api/v1/skills", { content: skill("triage", "Ana's own triage"), botId: bot.id });
    const workspace = t.hub.computer.workspaceDir(bot.id);
    // A skill the user put in the workspace themselves is left alone.
    mkdirSync(path.join(workspace, ".claude", "skills", "mine"), { recursive: true });
    writeFileSync(path.join(workspace, ".claude", "skills", "mine", "SKILL.md"), skill("mine", "The user's own"));

    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const send = async (text: string) => t!.hub.engine.wait((await t!.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text })).body.runs[0].id);
    expect((await send("hello")).status).toBe("done");
    const seen = () => (JSON.parse(readFileSync(path.join(workspace, "fake-claude-skills.json"), "utf8")) as Array<{ name: string; content: string }>);
    expect(seen().map((s) => s.name).sort()).toEqual(["mine", "release-notes", "triage"]);
    expect(seen().find((s) => s.name === "triage")!.content).toContain("description: Ana's own triage");
    const argv = JSON.parse(readFileSync(path.join(workspace, "fake-claude-argv.json"), "utf8")) as string[];
    expect(argv[argv.indexOf("--append-system-prompt") + 1]).toContain("- release-notes: Write release notes");

    await t.api("DELETE", `/api/v1/skills/triage?botId=${bot.id}`);
    await send("again");
    expect(seen().map((s) => s.name).sort()).toEqual(["mine", "release-notes"]);
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

  it("answers Claude Code permission prompts with the Orbis policy through approval_prompt", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = t.hub.botService.get((await createBot(t, { brain: fakeClaude })).id);
    const conv = t.hub.conversationService.directFor(bot.id);
    const run = t.hub.engine.enqueue({ botId: bot.id, conversationId: conv.id, trigger: { type: "api", ref: null }, input: "HANG" });
    const session = t.hub.gateway.open(t.hub.repos.runs.get(run.id)!, bot, new AbortController().signal);
    const token = session.mcp!.server.env.ORBIS_RUN_TOKEN!;
    const call = (tool_name: string, input: unknown) =>
      t!.hub.app.inject({
        method: "POST",
        url: "/mcp",
        headers: { authorization: `Bearer ${token}` },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "approval_prompt", arguments: { tool_name, input } } },
      });
    const decision = async (res: Promise<{ body: string }>) => JSON.parse(JSON.parse((await res).body).result.content[0].text);

    // Read maps to computer.read_file (default allow); Orbis's own tools are gated at execution.
    expect(await decision(call("Read", { file_path: "a" }))).toEqual({ behavior: "allow", updatedInput: { file_path: "a" } });
    expect(await decision(call("mcp__orbis__team_list_bots", {}))).toMatchObject({ behavior: "allow" });

    // Bash maps to computer.shell, which asks by default: an approval card waits for the user.
    const pending = decision(call("Bash", { command: "rm -rf build" }));
    let approval;
    for (let i = 0; i < 200 && !approval; i++) {
      approval = t.hub.approvals.list("pending")[0];
      if (!approval) await new Promise((r) => setTimeout(r, 10));
    }
    expect(approval).toMatchObject({ tool: "computer.shell", input: { claudeTool: "Bash", input: { command: "rm -rf build" } } });
    t.hub.approvals.resolve(approval!.id, "deny", "use the Makefile");
    expect(await pending).toEqual({ behavior: "deny", message: "The user denied computer.shell. Note from the user: use the Makefile" });
    session.close();
    t.hub.engine.cancel(run.id);
  });
});
