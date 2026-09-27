// specs/agent-runtimes — acceptance criteria 5 (custom-cli here; codex and
// gemini-cli join in the brains change) and 6 (scrubbed environment).
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { harnessEnv, resolveExecutable } from "../../src/brains/process.js";
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
});
