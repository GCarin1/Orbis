// The chat and bot deep audit (change 0022-chat-and-bot-deep-audit): each
// defect found reading the engine, the brains, the bridge, the context and the
// memory, kept as a regression.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Run, TimelineItem } from "@orbis/shared";
import { clipItem, fitHistory, identityText, MAX_HISTORY_ITEM, type ContextItem } from "../src/context/assemble.js";
import { runMcpBridge } from "../src/mcp/bridge.js";
import { splitThinking } from "../src/brains/openai.js";
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
const fakeCodex = { kind: "codex", command: process.execPath, args: [path.join(FIXTURES, "fake-codex.mjs")] };
const pendingApproval = async (t: TestHub) => {
  for (let i = 0; i < 300; i++) {
    const [approval] = t.hub.approvals.list("pending");
    if (approval) return approval;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("no approval was requested");
};
const send = async (t: TestHub, conversationId: string, text: string): Promise<Run> =>
  t.hub.engine.wait((await t.api("POST", `/api/v1/conversations/${conversationId}/messages`, { text })).body.runs[0].id);

describe("CLI brains and the MCP bridge", () => {
  it("does not kill a Claude Code run that waits for the user's approval longer than its time limit, and answers its other calls meanwhile", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = await createBot(t, { brain: { ...fakeClaude, timeoutSec: 1 } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "ASK_BASH" });
    const approval = await pendingApproval(t);
    expect(approval.tool).toBe("computer.shell");
    // The user answers after the bot's whole time limit.
    await new Promise((r) => setTimeout(r, 1_600));
    t.hub.approvals.resolve(approval.id, "allow_once");
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.error).toBeNull();
    expect(run.status).toBe("done");
    // The team list (id 3) came back while the approval (id 2) still waited.
    expect(run.reply).toBe("bash allow; answers in order 1,3,2");
  });

  it("forwards tool calls side by side, so a slow one does not hold up the others", async () => {
    const order: number[] = [];
    server = createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      const msg = JSON.parse(body) as { id: number };
      if (msg.id === 1) await new Promise((r) => setTimeout(r, 300));
      order.push(msg.id);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: number[] = [];
    output.on("data", (chunk: Buffer) =>
      lines.push(
        ...chunk
          .toString()
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l).id as number),
      ),
    );
    const done = runMcpBridge({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token: "x", input, output });
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} }) + "\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {} }) + "\n");
    input.end();
    await done;
    expect(order).toEqual([2, 1]);
    expect(lines).toEqual([2, 1]);
  });

  it("starts a new Claude Code session with the whole conversation when the stored one is gone", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeClaude });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    expect((await send(t, conv.id, "the deploy key is in vault 7")).status).toBe("done");
    t.hub.repos.sessions.set(bot.id, conv.id, "claude-code", "gone-session");
    expect((await send(t, conv.id, "where is the key?")).status).toBe("done");
    const prompt = readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-claude-prompt.txt"), "utf8");
    expect(prompt).toContain("the deploy key is in vault 7");
  });

  it("starts a new Codex thread with the whole conversation when the stored one is gone, instead of failing every message", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeCodex });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    expect((await send(t, conv.id, "remember: invoice 42 is paid")).status).toBe("done");
    t.hub.repos.sessions.set(bot.id, conv.id, "codex", "gone-thread");
    const run = await send(t, conv.id, "is invoice 42 paid?");
    expect(run.status).toBe("done");
    expect(run.reply).toBe("new: is invoice 42 paid?");
    expect(t.hub.repos.sessions.get(bot.id, conv.id, "codex")).toBe("thread-abc");
    const prompt = readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-codex-prompt.txt"), "utf8");
    expect(prompt).toContain("remember: invoice 42 is paid");
    const argv = JSON.parse(readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-codex-argv.json"), "utf8")) as string[];
    expect(argv).toContain("mcp_servers.orbis.tool_timeout_sec=86400");
  });

  it("sends a long prompt on stdin, not on the command line Windows caps at 32,767 characters", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: fakeClaude });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const pasted = `review this contract:\n${"cláusula longa. ".repeat(1_500)}`;
    const run = await send(t, conv.id, pasted);
    expect(run.status).toBe("done");
    const workspace = t.hub.computer.workspaceDir(bot.id);
    const argv = JSON.parse(readFileSync(path.join(workspace, "fake-claude-argv.json"), "utf8")) as string[];
    expect(argv[argv.indexOf("-p") + 1]).toBe("--output-format");
    expect(argv.join(" ").length).toBeLessThan(20_000);
    expect(readFileSync(path.join(workspace, "fake-claude-prompt.txt"), "utf8")).toContain(pasted.trim());
  });
});

describe("what a bot is told", () => {
  it("cuts a long message in its history instead of dropping the whole history", () => {
    const item = (n: number, text: string): ContextItem => ({
      itemId: `i${n}`,
      author: "user",
      role: "user",
      text,
      at: new Date(2026, 0, 1, 0, 0, n).toISOString(),
    });
    const report = "R".repeat(13_000);
    const kept = fitHistory([item(1, "o contrato é de 2024"), item(2, "qual o prazo?"), item(3, report)]);
    expect(kept.map((i) => i.itemId)).toEqual(["i1", "i2", "i3"]);
    expect(kept[2]!.text.length).toBeLessThan(MAX_HISTORY_ITEM + 60);
    expect(kept[2]!.text).toContain("characters left out");
    expect(clipItem("short")).toBe("short");
  });

  it("knows today's date, where it is and who is there, and answers in the user's language", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", role: "QA" });
    const bob = await createBot(t, { name: "Bob", role: "Dev" });
    expect(identityText(t.hub.botService.get(ana.id), new Date("2026-10-02T12:00:00Z"))).toMatch(/Today is \w+day, \d+ October 2026 \(.+\)\./);
    expect(identityText(t.hub.botService.get(ana.id))).toContain("Answer in the language the user writes in.");
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Release", members: [ana.id, bob.id], leadBotId: ana.id })).body;
    const run = t.hub.engine.enqueue({ botId: ana.id, conversationId: group.id, trigger: { type: "api", ref: null }, input: "/reply ok" });
    await t.hub.engine.wait(run.id);
    const section = t.hub.conversationService.contextSection(t.hub.botService.get(ana.id), t.hub.repos.runs.get(run.id)!);
    expect(section).toBe(
      'Where you are: the group "Release", with the user and Bob (bob, Dev). Everyone here reads every message. You lead it: the user\'s messages that name nobody come to you.',
    );
    const direct = t.hub.conversationService.directFor(bob.id);
    const own = t.hub.engine.enqueue({ botId: bob.id, conversationId: direct.id, trigger: { type: "api", ref: null }, input: "/reply ok" });
    await t.hub.engine.wait(own.id);
    expect(t.hub.conversationService.contextSection(t.hub.botService.get(bob.id), t.hub.repos.runs.get(own.id)!)).toMatch(
      /^Where you are: your own conversation with the user/,
    );
  });

  it("leaves other bots' failures out of a bot's history, and keeps its own", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const anl = await createBot(t, { name: "Anl", brain: { kind: "openai", model: "gpt-5" } });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Equipe", members: [ana.id, anl.id], leadBotId: ana.id })).body;
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@anl oi" });
    await t.hub.engine.idle();
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@ana quem respondeu?" });
    await t.hub.engine.idle();
    const anaRun = t.hub.repos.runs.list({ botId: ana.id })[0]!;
    // Ana's history: the two user messages minus the one she answers, and Anl's failure left out.
    expect(anaRun.steps[0]!.text).toBe("Reading the task (1 earlier items in context)");
  });
});

describe("runs and the bot's state", () => {
  it("keeps a bot busy while it still works in another conversation", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "G", members: [ana.id, bob.id] })).body;
    const direct = t.hub.conversationService.directFor(ana.id);
    const long = t.hub.engine.enqueue({ botId: ana.id, conversationId: direct.id, trigger: { type: "api", ref: null }, input: "/sleep 800\n/reply long" });
    const short = t.hub.engine.enqueue({ botId: ana.id, conversationId: group.id, trigger: { type: "api", ref: null }, input: "/reply short" });
    await t.hub.engine.wait(short.id);
    expect(t.hub.botService.get(ana.id).state).toBe("working");
    await t.hub.engine.wait(long.id);
    expect(t.hub.botService.get(ana.id).state).toBe("done");
  });

  it("works again only when the last of two open approvals is answered", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const conv = t.hub.conversationService.directFor(ana.id);
    const run = t.hub.engine.enqueue({ botId: ana.id, conversationId: conv.id, trigger: { type: "api", ref: null }, input: "/sleep 400\n/reply ok" });
    while (t.hub.repos.runs.get(run.id)!.status !== "running") await new Promise((r) => setTimeout(r, 5));
    t.hub.engine.markWaiting(run.id, true);
    t.hub.engine.markWaiting(run.id, true);
    t.hub.engine.markWaiting(run.id, false);
    expect(t.hub.repos.runs.get(run.id)!.status).toBe("waiting");
    t.hub.engine.markWaiting(run.id, false);
    expect(t.hub.repos.runs.get(run.id)!.status).toBe("running");
    expect((await t.hub.engine.wait(run.id)).status).toBe("done");
  });

  it("closes runs left waiting for the user, and their handoff cards, when the hub restarts", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const conv = t.hub.conversationService.directFor(ana.id);
    const waiting: Run = {
      id: newId("run"),
      botId: bob.id,
      conversationId: conv.id,
      trigger: { type: "handoff", ref: null },
      depth: 1,
      chainId: "c",
      status: "queued",
      input: "x",
      skill: null,
      steps: [],
      reply: null,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscription: false },
      error: null,
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
    };
    t.hub.repos.runs.insert(waiting);
    t.hub.repos.runs.setStatus(waiting.id, "waiting");
    const card = t.hub.timeline.post({
      conversationId: conv.id,
      kind: "card",
      author: { type: "bot", id: ana.id },
      text: "@ana → @bob: x",
      card: { type: "handoff", state: "running", data: { from: ana.id, to: bob.id, task: "x", context: null, returnResult: true, receiverRunId: waiting.id } },
    });
    const dir = t.dataDir;
    await t.hub.close();
    t = await testHub({}, dir);
    expect(t.hub.repos.runs.get(waiting.id)).toMatchObject({ status: "failed", error: "the hub stopped during this run" });
    expect(t.hub.repos.items.get(card.id)!.card).toMatchObject({ state: "failed", data: { error: "the hub stopped before this handoff ended" } });
  });

  it("tries a failed run again once the user fixed the bot, and refuses one that did not fail", async () => {
    t = await testHub();
    const anl = await createBot(t, { name: "Anl", brain: { kind: "openai", model: "gpt-5" } });
    const { runs, conversation } = await chat(t, anl.id, "/reply resolvido");
    expect(runs[0].status).toBe("failed");
    await t.api("PATCH", `/api/v1/bots/${anl.id}`, { brain: { kind: "mock" } });
    const retried = await t.api("POST", `/api/v1/runs/${runs[0].id}/retry`);
    expect(retried.status).toBe(201);
    expect(retried.body.retryOf).toBe(runs[0].id);
    const run = await t.hub.engine.wait(retried.body.id);
    expect(run).toMatchObject({ status: "done", reply: "resolvido" });
    const items: TimelineItem[] = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body;
    expect(items.filter((i) => i.kind === "message").map((i) => i.text)).toEqual(["/reply resolvido", "resolvido"]);
    expect((await t.api("POST", `/api/v1/runs/${run.id}/retry`)).status).toBe(409);
  });

  it("lets the user be asked again for a call they denied, instead of counting it as a repeat", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const shell = `/tool computer.shell ${JSON.stringify({ command: "echo hi" })}`;
    const conv = t.hub.conversationService.directFor(ana.id);
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: [shell, shell, shell].join("\n") });
    for (const decision of ["deny", "deny", "allow_once"] as const) t.hub.approvals.resolve((await pendingApproval(t)).id, decision);
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    const results = run.steps.filter((s) => s.type === "tool_result");
    expect(results.map((r) => r.isError)).toEqual([true, true, false]);
  });
});

describe("API brains", () => {
  it("retries a rate limit, runs tool calls a server ends with finish_reason stop, and keeps <think> out of the reply", async () => {
    let calls = 0;
    const bodies: Array<{ messages: Array<{ role: string }> }> = [];
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      calls++;
      if (calls === 1) {
        res.writeHead(429, { "retry-after": "0.05" });
        res.end("slow down");
        return;
      }
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      if (bodies.length === 1) {
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "team_list_bots", arguments: "{}" } }] } }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      } else {
        send({ choices: [{ index: 0, delta: { content: "<think>a equipe tem 1 bot</think>\n\nSó a Ana está na equipe." } }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    t = await testHub();
    const ana = await createBot(t, {
      name: "Ana",
      brain: { kind: "lmstudio", model: "qwen3", baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` },
    });
    const { runs } = await chat(t, ana.id, "quem está na equipe?");
    expect(runs[0]).toMatchObject({ status: "done", reply: "Só a Ana está na equipe." });
    expect(runs[0].steps.map((s: { type: string }) => s.type)).toEqual(["thinking", "tool_call", "tool_result", "thinking", "text"]);
    expect(bodies[1]!.messages.some((m) => m.role === "tool")).toBe(true);
    expect(splitThinking("<think>unfinished")).toEqual({ thinking: "unfinished", text: "" });
  });

  it("says why http.fetch failed", async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const { runs } = await chat(t, ana.id, `/tool http.fetch ${JSON.stringify({ url: `http://127.0.0.1:${port}/` })}`);
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result").output).toMatch(/^fetch failed \(ECONNREFUSED\)/);
  });
});

describe("memory", () => {
  it("keeps no summary of an answer to a mention or a report, and the same summary once", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const conv = t.hub.conversationService.directFor(ana.id);
    for (const type of ["mention", "report", "message", "message"] as const) {
      await t.hub.engine.wait(
        t.hub.engine.enqueue({ botId: ana.id, conversationId: conv.id, trigger: { type, ref: null }, input: "/reply Disponíveis: Anl e Dev" }).id,
      );
    }
    expect(t.hub.repos.memory.list(ana.id).filter((m) => m.kind === "summary")).toHaveLength(1);
  });

  it("searches memory by meaningful words, not by 'de' or 'the'", () => {
    expect(ftsQuery("qual é o preço de lápis para a equipe?")).toBe('"qual" "preço" "lápis" "equipe"'.split(" ").join(" OR "));
    expect(ftsQuery("de the a")).toBeNull();
  });

  it("puts at most three summaries of past runs in a bot's context", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const at = nowIso();
    for (let i = 0; i < 6; i++) {
      t.hub.repos.memory.insert({
        id: newId("mem"),
        botId: ana.id,
        kind: "summary",
        text: `Task: preço do lápis ${i}\nResult: R$ ${i}`,
        source: "test",
        createdAt: at,
        updatedAt: at,
      });
    }
    t.hub.repos.memory.insert({
      id: newId("mem"),
      botId: ana.id,
      kind: "fact",
      text: "o fornecedor de lápis é a Faber",
      source: "test",
      createdAt: at,
      updatedAt: at,
    });
    const { runs } = await chat(t, ana.id, "/reply ok — preço do lápis?");
    expect(runs[0].status).toBe("done");
    const { assembleContext } = await import("../src/context/assemble.js");
    const ctx = assembleContext(
      { bot: t.hub.botService.get(ana.id), conversationId: null, task: "preço do lápis" },
      { items: t.hub.repos.items, memory: t.hub.repos.memory, bots: t.hub.repos.bots },
    );
    expect(ctx.memories.filter((m) => m.kind === "summary")).toHaveLength(3);
    expect(ctx.memories.some((m) => m.kind === "fact")).toBe(true);
    expect(existsSync(t.dataDir)).toBe(true);
  });
});
