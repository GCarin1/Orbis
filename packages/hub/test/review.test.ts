// The review of changes 0021 to 0027 (change 0028-review-of-the-audits):
// defects found re-reading the chat and the bots, kept as regressions.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ContextItem } from "../src/context/assemble.js";
import { assembleContext } from "../src/context/assemble.js";
import { historyFor } from "../src/brains/prompt.js";
import { shellCommand } from "../src/computer/local.js";
import { decodeText } from "../src/computer/tools.js";
import { ftsQuery } from "../src/repos/memory.js";
import { newId, nowIso } from "../src/ids.js";
import { chat, createBot, FIXTURES, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const fakeClaude = { kind: "claude-code", command: process.execPath, args: [path.join(FIXTURES, "fake-claude.mjs")] };

describe("the shell and files on Windows", () => {
  it("passes a command with quotes to cmd.exe as written", () => {
    expect(shellCommand('mkdir "Nova Pasta" && git commit -m "primeiro"', { ComSpec: "C:\\Windows\\system32\\cmd.exe" }, "win32")).toEqual({
      file: "C:\\Windows\\system32\\cmd.exe",
      args: ["/d", "/s", "/c", '"chcp 65001 >nul & mkdir "Nova Pasta" && git commit -m "primeiro""'],
      verbatim: true,
    });
  });

  it("reads the UTF-16 files Windows PowerShell writes, and UTF-8 with a BOM, as text", async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("relatório\r\n", "utf16le")]);
    expect(decodeText(utf16)).toBe("relatório\r\n");
    expect(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("olá")]))).toBe("olá");
    expect(decodeText(Buffer.from([0x89, 0x50, 0x00, 0x01]))).toBeNull();
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    writeFileSync(path.join(t.hub.computer.ensureWorkspace(ana.id), "saida.txt"), utf16);
    const { runs } = await chat(t, ana.id, `/tool computer.read_file ${JSON.stringify({ path: "saida.txt" })}`);
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result")).toMatchObject({ isError: false, output: "relatório\r\n" });
  });
});

describe("what a resumed session is told", () => {
  it("sends what others wrote while the bot's last run worked, and not the bot's own reply again", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 9, 2, 12, 0, s)).toISOString();
    const item = (id: string, author: string, s: number): ContextItem => ({
      itemId: id,
      author,
      role: author === "you" ? "assistant" : author === "user" ? "user" : "other",
      text: id,
      at: at(s),
    });
    const history = [
      item("old question", "user", 1),
      item("bob while ana worked", "@bob", 12),
      item("ana's reply", "you", 15),
      item("new from user", "user", 30),
    ];
    const ctx = { identity: "", memories: [], history, since: { from: at(10), ownUntil: at(20) } };
    expect(historyFor(ctx, true).map((h) => h.itemId)).toEqual(["bob while ana worked", "new from user"]);
    expect(historyFor(ctx, false)).toHaveLength(4);
  });

  it("gives a resumed Claude Code session a colleague's message posted during its last run", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", brain: fakeClaude });
    const bob = await createBot(t, { name: "Bob" });
    const conv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    const send = async (text: string) => t!.hub.engine.wait((await t!.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text })).body.runs[0].id);
    const first = await send("prepare the report");
    // Bob spoke here while Ana's first run worked.
    const during = new Date((Date.parse(first.startedAt!) + Date.parse(first.finishedAt!)) / 2).toISOString();
    t.hub.timeline.post({
      conversationId: conv.id,
      kind: "message",
      author: { type: "bot", id: bob.id },
      text: "the numbers changed at noon",
      createdAt: during,
    });
    expect((await send("and now?")).status).toBe("done");
    const prompt = readFileSync(path.join(t.hub.computer.workspaceDir(ana.id), "fake-claude-prompt.txt"), "utf8");
    expect(prompt).toContain("the numbers changed at noon");
    expect(prompt).not.toContain(first.reply!);
  });
});

describe("memory", () => {
  it("keeps a fact in the context even when more summaries than fit rank above it", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const at = nowIso();
    for (let i = 0; i < 10; i++) {
      t.hub.repos.memory.insert({
        id: newId("mem"),
        botId: ana.id,
        kind: "summary",
        text: `Task: preço lápis preço lápis ${i}\nResult: preço lápis R$ ${i}`,
        source: "test",
        createdAt: at,
        updatedAt: at,
      });
    }
    t.hub.repos.memory.insert({
      id: newId("mem"),
      botId: ana.id,
      kind: "fact",
      text: "o fornecedor de lápis é a Faber, e muda em 2027 para outra empresa da região",
      source: "test",
      createdAt: at,
      updatedAt: at,
    });
    const ctx = assembleContext(
      { bot: t.hub.botService.get(ana.id), conversationId: null, task: "preço do lápis" },
      { items: t.hub.repos.items, memory: t.hub.repos.memory, bots: t.hub.repos.bots },
    );
    expect(ctx.memories.filter((m) => m.kind === "summary")).toHaveLength(3);
    expect(ctx.memories.some((m) => m.kind === "fact")).toBe(true);
  });

  it("leaves common Portuguese words with accents out of the search", () => {
    expect(ftsQuery("quem está disponível? não sei, você já viu?")).toBe('"disponível" OR "sei" OR "viu"');
  });
});

describe("trying a run again", () => {
  it("refuses to try a routine's run again outside its routine, which keeps its draft-only rules", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", brain: { kind: "openai", model: "gpt-5" } });
    const routine = (await t.api("POST", `/api/v1/bots/${ana.id}/routines`, { name: "Report", trigger: { type: "webhook" }, instruction: "send the report" }))
      .body;
    const fired = (await t.api("POST", `/api/v1/routines/${routine.id}/test`)).body;
    expect((await t.hub.engine.wait(fired.runId)).status).toBe("failed");
    const res = await t.api("POST", `/api/v1/runs/${fired.runId}/retry`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("routine_run");
  });
});

describe("API brains at their last step", () => {
  it("asks for the final answer once, even when that request is retried", async () => {
    const bodies: Array<{ tools?: unknown; messages: Array<{ role: string; content: unknown }> }> = [];
    let limited = false;
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      // The last step (no tools) is rate-limited once.
      if (!body.tools && !limited) {
        limited = true;
        res.writeHead(429, { "retry-after": "0.05" });
        return res.end();
      }
      bodies.push(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      if (body.tools)
        send({
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "memory_search", arguments: '{"query":"x"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
        });
      else send({ choices: [{ index: 0, delta: { content: "pronto" }, finish_reason: "stop" }] });
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    t = await testHub();
    const ana = await createBot(t, {
      name: "Ana",
      brain: { kind: "lmstudio", model: "m", baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, maxSteps: 2 },
    });
    const { runs } = await chat(t, ana.id, "pesquise");
    expect(runs[0]).toMatchObject({ status: "done", reply: "pronto" });
    const notes = bodies.at(-1)!.messages.filter((m) => JSON.stringify(m.content).includes("Do not call tools any more"));
    expect(notes).toHaveLength(1);
  });
});
