// specs/agent-runtimes — the cursor brain, the ollama and lmstudio brains, local
// models without tool support, the brain test, local model servers and Windows
// .cmd shims (change 0013-brains-settings).
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { cursorArgs } from "../../src/brains/cursor.js";
import { localModelServers, runtimeHealth } from "../../src/brains/health.js";
import { launchCommand, unwrapCmdShim } from "../../src/brains/process.js";
import { createBot, FIXTURES, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const fakeCursor = { kind: "cursor", command: process.execPath, args: [path.join(FIXTURES, "fake-cursor.mjs")] };

async function runOnce(t: TestHub, botId: string, text: string) {
  const conv = (await t.api("GET", `/api/v1/bots/${botId}/conversation`)).body;
  const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text });
  return t.hub.engine.wait(posted.body.runs[0].id);
}

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

/** A local model server: `/v1/models`, and chat completions that refuse tools like Ollama does for small models. */
async function fakeLocalServer(opts: { toolSupport: boolean }): Promise<{ url: string; requests: any[] }> {
  const requests: any[] = [];
  server = createServer(async (req: IncomingMessage, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "qwen3:4b" }, { id: "llama3.2:latest" }] }));
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    requests.push({ body, auth: req.headers.authorization });
    if (body.tools && !opts.toolSupport) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `registry.ollama.ai/library/${body.model} does not support tools`, type: "api_error" } }));
      return;
    }
    const question = String(body.messages.at(-1)?.content ?? "");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(data({ choices: [{ index: 0, delta: { content: question.includes("17 × 23") ? "391" : `local: ${question.split("\n").pop()}` } }] }));
    res.write(data({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`, requests };
}

describe("cursor brain", () => {
  it("runs the Cursor CLI headless in the workspace, maps stream-json and resumes the chat", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = await createBot(t, { name: "Cursa", brain: { ...fakeCursor, model: "sonnet-4" } });
    const first = await runOnce(t, bot.id, "read the readme");
    expect(first.error).toBeNull();
    expect(first.reply).toBe("cursor says: read the readme");
    expect(first.steps.map((s) => s.type)).toEqual(["text", "tool_call", "tool_result", "tool_call", "tool_result", "text"]);
    expect(first.steps[1]).toMatchObject({ tool: "read", input: { path: "README.md" } });
    expect(first.steps[2]).toMatchObject({ output: "# Readme", isError: false });
    expect(first.steps[3]).toMatchObject({ tool: "orbis__team_list_bots", input: {} });
    expect(first.steps[4]).toMatchObject({ output: "denied", isError: true });
    expect(first.usage).toMatchObject({ subscription: true });

    const workspace = t.hub.computer.workspaceDir(bot.id);
    const argv = JSON.parse(readFileSync(path.join(workspace, "fake-cursor-argv.json"), "utf8")) as string[];
    expect(argv.slice(0, 9)).toEqual(["-p", "--output-format", "stream-json", "--trust", "--workspace", workspace, "--approve-mcps", "--model", "sonnet-4"]);
    expect(argv.at(-1)).toContain("Task:\nread the readme");
    // The Orbis MCP server and its tool permission exist only during the run.
    const mcp = JSON.parse(readFileSync(path.join(workspace, "fake-cursor-mcp.json"), "utf8"));
    expect(mcp.mcpServers.orbis).toMatchObject({ type: "stdio", command: process.execPath });
    expect(mcp.mcpServers.orbis.env.ORBIS_RUN_TOKEN).toBeTruthy();
    expect(JSON.parse(readFileSync(path.join(workspace, "fake-cursor-cli.json"), "utf8"))).toEqual({ permissions: { allow: ["Mcp(orbis:*)"] } });
    expect(existsSync(path.join(workspace, ".cursor", "mcp.json"))).toBe(false);
    expect(existsSync(path.join(workspace, ".cursor", "cli.json"))).toBe(false);

    const second = await runOnce(t, bot.id, "and then?");
    expect(second.reply).toBe("resumed: and then?");
    const argv2 = JSON.parse(readFileSync(path.join(workspace, "fake-cursor-argv.json"), "utf8")) as string[];
    expect(argv2.slice(-3, -1)).toEqual(["--resume", "chat-1"]);
  });

  it("starts a new chat when the stored one no longer resumes", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Cursa", brain: fakeCursor });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    t.hub.repos.sessions.set(bot.id, conv.id, "cursor", "gone-chat");
    const run = await runOnce(t, bot.id, "hello");
    expect(run.error).toBeNull();
    expect(run.reply).toBe("cursor says: hello");
  });

  it("fails the run with Cursor's error, from a result or from stderr", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Cursa", brain: fakeCursor });
    const failed = await runOnce(t, bot.id, "TURN_FAILS");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("you hit your usage limit");
    const loggedOut = await runOnce(t, bot.id, "NOT_LOGGED_IN");
    expect(loggedOut.error).toMatch(/exit code 1: Authentication required/);
  });

  it("names the missing Cursor CLI before starting a run", async () => {
    t = await testHub();
    const oldPath = process.env.PATH;
    process.env.PATH = mkdtempSync(path.join(tmpdir(), "orbis-empty-path-"));
    try {
      const bot = await createBot(t, { name: "Cursa", brain: { kind: "cursor" } });
      const run = await runOnce(t, bot.id, "hi");
      expect(run.status).toBe("failed");
      expect(run.error).toMatch(/Cursor CLI \("cursor-agent" or "agent"\) is not on PATH/);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("puts the prompt last and adds --resume only with a chat id", () => {
    expect(cursorArgs({ prompt: "p", workspace: "/w", resume: null, mcp: false })).toEqual(["-p", "--output-format", "stream-json", "--trust", "--workspace", "/w", "p"]);
  });
});

describe("ollama and lmstudio brains", () => {
  it("run against the local server with no key, and a model without tools answers without them", async () => {
    const api = await fakeLocalServer({ toolSupport: false });
    t = await testHub({ config: { ollamaBaseUrl: api.url } });
    const bot = await createBot(t, { name: "Olla", brain: { kind: "ollama", model: "gemma3:1b" } });
    const run = await runOnce(t, bot.id, "say hi");
    expect(run.error).toBeNull();
    expect(run.reply).toBe("local: say hi");
    expect(run.steps[0]).toMatchObject({ type: "thinking", text: "gemma3:1b does not support tools here; answering without them." });
    expect(api.requests).toHaveLength(2);
    expect(api.requests[0].body.tools.length).toBeGreaterThan(0);
    expect(api.requests[1].body.tools).toBeUndefined();
    expect(api.requests.every((r) => r.auth === undefined)).toBe(true);
  });

  it("use the LM Studio address from the configuration, even when OPENAI_API_KEY is set", async () => {
    const api = await fakeLocalServer({ toolSupport: true });
    t = await testHub({ config: { lmstudioBaseUrl: api.url, openaiApiKey: "sk-remote-only" } });
    const bot = await createBot(t, { name: "Studio", brain: { kind: "lmstudio", model: "qwen3:4b" } });
    const run = await runOnce(t, bot.id, "hello");
    expect(run.reply).toBe("local: hello");
    expect(api.requests[0].auth).toBeUndefined();
  });

  it("name the missing model", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Olla", brain: { kind: "ollama" } });
    const run = await runOnce(t, bot.id, "hi");
    expect(run.error).toMatch(/ollama brain: no model configured .*ollama list/);
  });
});

describe("brain test and local servers", () => {
  it("POST /api/v1/runtimes/test asks a brain the test question and says whether a model answered", async () => {
    t = await testHub();
    const cursor = await t.api("POST", "/api/v1/runtimes/test", { brain: fakeCursor });
    expect(cursor.status).toBe(200);
    expect(cursor.body).toMatchObject({ kind: "cursor", ok: true, reply: "391", error: null, answered: true });
    expect(cursor.body.durationMs).toBeGreaterThanOrEqual(0);

    // The mock brain echoes the question: it runs, but no model answered.
    const bot = await createBot(t, { name: "Echo", brain: { kind: "mock" } });
    const mock = await t.api("POST", "/api/v1/runtimes/test", { botId: bot.handle });
    expect(mock.body).toMatchObject({ kind: "mock", ok: true, answered: false });
    expect(mock.body.reply).toContain("[Echo] What is 17 × 23?");

    const missing = await t.api("POST", "/api/v1/runtimes/test", { brain: { kind: "ollama" } });
    expect(missing.body).toMatchObject({ ok: false, answered: false, error: expect.stringMatching(/no model configured/) });
    expect((await t.api("POST", "/api/v1/runtimes/test", {})).status).toBe(400);
    // The test left no workspace behind.
    expect(existsSync(path.join(t.hub.config.dataDir, "brain-tests"))).toBe(true);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(path.join(t.hub.config.dataDir, "brain-tests"))).toEqual([]);
  });

  it("runs one test at a time per brain kind (409 while one runs)", async () => {
    t = await testHub();
    const slow = { kind: "custom-cli", command: process.execPath, args: ["-e", "setTimeout(() => console.log('391'), 1500)"] };
    const first = t.api("POST", "/api/v1/runtimes/test", { brain: slow });
    await new Promise((r) => setTimeout(r, 300));
    const second = await t.api("POST", "/api/v1/runtimes/test", { brain: slow });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "test_running" });
    expect((await first).body).toMatchObject({ kind: "custom-cli", ok: true, reply: "391", answered: true });
  });

  it("tests a local model through its server", async () => {
    const api = await fakeLocalServer({ toolSupport: true });
    t = await testHub({ config: { ollamaBaseUrl: api.url } });
    const res = await t.api("POST", "/api/v1/runtimes/test", { brain: { kind: "ollama", model: "qwen3:4b" } });
    expect(res.body).toMatchObject({ ok: true, reply: "391", answered: true });
    // The test sends no tools.
    expect(api.requests[0].body.tools).toBeUndefined();
  });

  it("GET /api/v1/runtimes/local lists each server's models or says it is not reachable", async () => {
    const api = await fakeLocalServer({ toolSupport: true });
    t = await testHub({ config: { ollamaBaseUrl: api.url, lmstudioBaseUrl: "http://127.0.0.1:9/v1" } });
    const res = await t.api("GET", "/api/v1/runtimes/local");
    expect(res.body).toEqual([
      { kind: "ollama", baseUrl: api.url, reachable: true, models: ["llama3.2:latest", "qwen3:4b"], error: null },
      { kind: "lmstudio", baseUrl: "http://127.0.0.1:9/v1", reachable: false, models: [], error: "not reachable at http://127.0.0.1:9/v1" },
    ]);
  });

  it("defaults to Ollama on 11434 and LM Studio on 1234", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    t = await testHub();
    await localModelServers([{ kind: "ollama", baseUrl: t.hub.config.ollamaBaseUrl }, { kind: "lmstudio", baseUrl: t.hub.config.lmstudioBaseUrl }], fetchImpl);
    expect(seen).toEqual(["http://127.0.0.1:11434/v1/models", "http://127.0.0.1:1234/v1/models"]);
  });

  it("the health check finds the Cursor CLI under either name", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "orbis-bin-"));
    copyFileSync(path.join(FIXTURES, "fake-version.mjs"), path.join(bin, "agent"));
    chmodSync(path.join(bin, "agent"), 0o755);
    const health = await runtimeHealth(undefined, `${bin}${path.delimiter}${path.dirname(process.execPath)}`);
    expect(health.find((h) => h.kind === "cursor")).toEqual({ kind: "cursor", executable: "agent", found: true, path: path.join(bin, "agent"), version: "9.9.9 (fake)" });
  });
});

describe("Windows .cmd shims", () => {
  const npmShim = [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    "",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
    "  SET PATHEXT=%PATHEXT:;.JS;=;%",
    ")",
    "",
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
  ].join("\r\n");
  const shim = "C:\\Users\\ana\\AppData\\Roaming\\npm\\claude.cmd";

  it("runs an npm shim's script with Node, so a multi-line prompt stays one argument", () => {
    const launch = launchCommand(shim, ["-p", "line one\nline two"], "win32", () => npmShim, () => false);
    expect(launch).toEqual({
      command: process.execPath,
      args: ["C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js", "-p", "line one\nline two"],
    });
  });

  it("prefers the node.exe next to the shim, and reads the older %~dp0 form", () => {
    const older = '@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\@google\\gemini-cli\\dist\\index.js" %*\r\n)';
    const target = unwrapCmdShim("D:\\tools\\gemini.cmd", older, (file) => file === "D:\\tools\\node.exe");
    expect(target).toEqual({ command: "D:\\tools\\node.exe", args: ["D:\\tools\\node_modules\\@google\\gemini-cli\\dist\\index.js"] });
  });

  it("refuses a batch file with no script, and leaves other platforms and .exe files alone", () => {
    expect(() => launchCommand("C:\\bin\\tool.bat", [], "win32", () => "@echo off\r\ntool.exe %*")).toThrow(/Windows batch file/);
    expect(launchCommand("C:\\bin\\claude.exe", ["-p"], "win32")).toEqual({ command: "C:\\bin\\claude.exe", args: ["-p"] });
    expect(launchCommand("/usr/bin/claude.cmd", ["-p"], "linux")).toEqual({ command: "/usr/bin/claude.cmd", args: ["-p"] });
  });
});
