// specs/agent-runtimes — acceptance criteria 5 (codex, gemini-cli and custom-cli
// from fake executables) and 6 (scrubbed environment).
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { harnessEnv, resolveExecutable } from "../../src/brains/process.js";
import { codexArgs, codexMcpOverrides } from "../../src/brains/codex.js";
import { createBot, FIXTURES, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const fakeCli = (args: string[] = []) => ({ kind: "custom-cli", command: process.execPath, args: [path.join(FIXTURES, "fake-cli.mjs"), ...args] });

async function runOnce(t: TestHub, botId: string, text: string) {
  const conv = (await t.api("GET", `/api/v1/bots/${botId}/conversation`)).body;
  const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text });
  return t.hub.engine.wait(posted.body.runs[0].id);
}

describe("CLI harness processes", () => {
  it("passes no ORBIS_TOKEN, ORBIS_MASTER_KEY, API key or secret to a brain process (criterion 6)", () => {
    const env = harnessEnv({}, {
      PATH: "/usr/bin",
      HOME: "/home/u",
      ORBIS_TOKEN: "hub-token",
      ORBIS_MASTER_KEY: "k".repeat(64),
      ORBIS_RUN_TOKEN: "other-run",
      ANTHROPIC_API_KEY: "sk-ant-x",
      OPENAI_API_KEY: "sk-x",
      CLAUDE_CONFIG_DIR: "/home/u/.claude",
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/u", CLAUDE_CONFIG_DIR: "/home/u/.claude" });
  });

  it("runs the child with that scrubbed environment in the bot's workspace (criterion 6)", async () => {
    process.env.ORBIS_MASTER_KEY = "master-key-that-must-not-leak";
    process.env.ANTHROPIC_API_KEY = "sk-ant-must-not-leak";
    try {
      t = await testHub();
      const bot = await createBot(t, { brain: fakeCli() });
      const run = await runOnce(t, bot.id, "hello");
      expect(run.status).toBe("done");
      const env = JSON.parse(readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-cli-env.json"), "utf8")) as Record<string, string>;
      expect(Object.keys(env).filter((k) => k.startsWith("ORBIS_"))).toEqual([]);
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(JSON.stringify(env)).not.toContain("must-not-leak");
      expect(JSON.stringify(env)).not.toContain("test-token");
    } finally {
      delete process.env.ORBIS_MASTER_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("custom-cli reads the prompt from stdin or the {prompt} argument and replies with stdout (criterion 5)", async () => {
    t = await testHub();
    const viaStdin = await createBot(t, { name: "Stdin", brain: fakeCli() });
    const viaArg = await createBot(t, { name: "Arg", brain: fakeCli(["{prompt}"]) });
    expect((await runOnce(t, viaStdin.id, "ping")).reply).toBe("custom reply (stdin): ping");
    expect((await runOnce(t, viaArg.id, "pong")).reply).toBe("custom reply (arg): pong");
  });

  it("custom-cli fails on a crash or an empty reply", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeCli() });
    const crashed = await runOnce(t, bot.id, "CRASH");
    expect(crashed.status).toBe("failed");
    expect(crashed.error).toMatch(/exit code 2: segfault in brain/);
    const silent = await runOnce(t, bot.id, "SILENT");
    expect(silent.error).toMatch(/printed no reply/);
  });

  it("resolves executables on PATH", () => {
    expect(resolveExecutable("node")).toBeTruthy();
    expect(resolveExecutable("no-such-binary-orbis")).toBeNull();
    expect(resolveExecutable(process.execPath)).toBe(process.execPath);
  });

  it("codex: runs exec --json in the workspace, maps its JSONL and resumes the thread (criterion 5)", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = await createBot(t, { name: "Cody", brain: { kind: "codex", command: process.execPath, args: [path.join(FIXTURES, "fake-codex.mjs")] } });
    const first = await runOnce(t, bot.id, "list the files");
    expect(first.error).toBeNull();
    expect(first.reply).toBe("new: list the files");
    expect(first.steps.map((s) => s.type)).toEqual(["thinking", "tool_call", "tool_result", "tool_call", "tool_result", "text"]);
    expect(first.steps[1]).toMatchObject({ tool: "shell", input: { command: "bash -lc ls" } });
    expect(first.steps[2]).toMatchObject({ output: "README.md\n", isError: false });
    expect(first.steps[3]).toMatchObject({ tool: "orbis.team_list_bots" });
    expect(first.usage).toEqual({ inputTokens: 300, outputTokens: 30, cachedTokens: 100, costUsd: 0, subscription: true });

    const workspace = t.hub.computer.workspaceDir(bot.id);
    const argv1 = JSON.parse(readFileSync(path.join(workspace, "fake-codex-argv.json"), "utf8")) as string[];
    expect(argv1.slice(0, 7)).toEqual(["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", workspace]);
    expect(argv1).toContain("mcp_servers.orbis.command=" + JSON.stringify(process.execPath));
    expect(argv1.find((a) => a.startsWith("mcp_servers.orbis.env="))).toMatch(/^mcp_servers\.orbis\.env=\{ORBIS_URL="http:\/\/127\.0\.0\.1:\d+",ORBIS_RUN_TOKEN="[\w-]+"\}$/);

    const second = await runOnce(t, bot.id, "and then?");
    expect(second.reply).toBe("resumed: and then?");
    const argv2 = JSON.parse(readFileSync(path.join(workspace, "fake-codex-argv.json"), "utf8")) as string[];
    expect(argv2.slice(-3, -1)).toEqual(["resume", "thread-abc"]);
  });

  it("codex: a failed turn fails the run with Codex's message", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Cody", brain: { kind: "codex", command: process.execPath, args: [path.join(FIXTURES, "fake-codex.mjs")] } });
    const run = await runOnce(t, bot.id, "TURN_FAILS");
    expect(run.status).toBe("failed");
    expect(run.error).toBe("usage limit reached for your plan");
  });

  it("codex: overrides are TOML-safe", () => {
    expect(codexMcpOverrides(null)).toEqual([]);
    expect(codexArgs({ prompt: "p", workspace: "/w", threadId: "t1", mcp: null, model: "gpt-5-codex" }).slice(-4)).toEqual(["gpt-5-codex", "resume", "t1", "p"]);
  });

  it("gemini-cli: writes the MCP settings for the run, maps stream-json and restores the settings (criterion 5)", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = await createBot(t, { name: "Gem", brain: { kind: "gemini-cli", command: process.execPath, args: [path.join(FIXTURES, "fake-gemini.mjs")], model: "gemini-2.5-pro" } });
    const run = await runOnce(t, bot.id, "summarise");
    expect(run.error).toBeNull();
    expect(run.reply).toBe("gemini says: summarise");
    expect(run.steps.map((s) => s.type)).toEqual(["text", "tool_call", "tool_result", "text"]);
    expect(run.steps[0]).toMatchObject({ text: "Looking" });
    expect(run.usage).toMatchObject({ inputTokens: 50, outputTokens: 20, subscription: true });

    const workspace = t.hub.computer.workspaceDir(bot.id);
    const argv = JSON.parse(readFileSync(path.join(workspace, "fake-gemini-argv.json"), "utf8")) as string[];
    expect(argv).toEqual(["-p", expect.stringContaining("Task:\nsummarise"), "--output-format", "stream-json", "-m", "gemini-2.5-pro"]);
    const settings = JSON.parse(readFileSync(path.join(workspace, "fake-gemini-settings.json"), "utf8"));
    expect(settings.mcpServers.orbis).toMatchObject({ command: process.execPath, trust: true });
    expect(settings.mcpServers.orbis.env.ORBIS_RUN_TOKEN).toBeTruthy();
    // The run token does not stay in the workspace after the run.
    expect(existsSync(path.join(workspace, ".gemini", "settings.json"))).toBe(false);
  });

  it("gemini-cli: falls back to a single JSON document", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Gem", brain: { kind: "gemini-cli", command: process.execPath, args: [path.join(FIXTURES, "fake-gemini.mjs")] } });
    const run = await runOnce(t, bot.id, "JSON_MODE please");
    expect(run.reply).toBe("json reply: JSON_MODE please");
  });
});
