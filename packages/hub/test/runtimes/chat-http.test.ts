// specs/agent-runtimes — the chat-http brain (change 0029-chat-http-brain): a
// chat orchestrator over HTTPS with a Bearer token, replayed by a fake server.
// The address and token here are made up; Orbis's code holds neither.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { browserHeaders, cleanBearer, parseCurl, shellWords, tokenExpiry } from "@orbis/shared";
import { resolveTransport, transportFor, windowsProxy } from "../../src/brains/http-transport.js";
import {
  AnswerReader,
  answerAfter,
  chatIds,
  chatPayload,
  eventText,
  historyBase,
  historyMessages,
  checkConnection,
  refusal,
  stripFollowUps,
  requestHeaders,
  toolRequest,
} from "../../src/brains/chat-http.js";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

/** A JWT-shaped token expiring at `exp` (seconds); the signature is made up. */
const jwt = (exp: number) =>
  [Buffer.from('{"alg":"none"}').toString("base64url"), Buffer.from(JSON.stringify({ exp, name: "Test User" })).toString("base64url"), "c2ln"].join(".");
const FRESH = jwt(Math.floor(Date.now() / 1000) + 3600);

interface Seen {
  auth: string | undefined;
  origin: string | undefined;
  headers: IncomingHttpHeaders;
  type: string | undefined;
  path: string | undefined;
  data: { context: { chatId: string }; agent: { agentId: string; version: string }; input: { role: string; content: string }; config: Record<string, unknown> };
}

/** The `data` field of a multipart body. */
async function dataField(req: IncomingMessage): Promise<Seen["data"]> {
  let raw = "";
  for await (const c of req) raw += c;
  const m = /name="data"\r\n\r\n([\s\S]*?)\r\n--/.exec(raw);
  if (!m) throw new Error(`no data field in: ${raw.slice(0, 200)}`);
  return JSON.parse(m[1]!);
}

/** What the fake's generate-title answers (500 to see a failing one change nothing). */
let titleStatus = 200;

/** A fake orchestrator: `answer` writes each response; `history` answers GETs (else 404); every POST is recorded. */
async function orchestrator(answer: (seen: Seen, res: ServerResponse, n: number) => void, history?: (path: string, headers: IncomingHttpHeaders) => unknown) {
  const seen: Seen[] = [];
  const reads: string[] = [];
  const readHeaders: IncomingHttpHeaders[] = [];
  const titles: Array<{ path: string; type: string | undefined; auth: string | undefined; body: unknown }> = [];
  server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url?.endsWith("/generate-title")) {
      let raw = "";
      for await (const c of req) raw += c;
      titles.push({ path: req.url, type: req.headers["content-type"], auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(titleStatus, { "content-type": "application/json" });
      return res.end('{"data":{"title":"Orbis · Ana"}}');
    }
    if (req.method === "GET") {
      reads.push(req.url ?? "");
      readHeaders.push(req.headers);
      const doc = history?.(req.url ?? "", req.headers);
      // A test can answer like a firewall: { status, html }.
      if (doc && typeof doc === "object" && "html" in doc) {
        const page = doc as { status: number; html: string };
        res.writeHead(page.status, { "content-type": "text/html" });
        return res.end(page.html);
      }
      res.writeHead(doc === undefined ? 404 : 200, { "content-type": "application/json" });
      return res.end(doc === undefined ? "{}" : JSON.stringify(doc));
    }
    const s: Seen = {
      auth: req.headers.authorization,
      origin: req.headers.origin,
      headers: req.headers,
      type: req.headers["content-type"],
      path: req.url,
      data: await dataField(req),
    };
    seen.push(s);
    answer(s, res, seen.length);
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/internal/v1/chat-orchestrator`, seen, reads, readHeaders, titles };
}

const sse = (res: ServerResponse, events: unknown[]) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.end();
};

async function chatBot(t: TestHub, url: string, extra: Record<string, unknown> = {}, token = FRESH) {
  const bot = await createBot(t, { name: "Ana", brain: { kind: "chat-http", baseUrl: url, apiKeySecret: "CHAT_BEARER_TOKEN", ...extra } });
  await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/CHAT_BEARER_TOKEN`, { value: `Bearer ${token}` });
  return bot;
}

describe("chat-http brain", () => {
  it("posts the message as a multipart `data` field with the Bearer token, reads a streamed answer and continues the chat the server returned", async () => {
    const fake = await orchestrator((_s, res, n) =>
      sse(res, [
        { type: "status", message: "Processando…" },
        { type: "delta", content: n === 1 ? "Olá! " : "Continuando: " },
        { type: "delta", content: n === 1 ? "Em que posso ajudar?" : "o preço é R$ 2." },
        { type: "end", chatId: "chat-123", usage: { inputTokens: 40, outputTokens: 9 } },
      ]),
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url, { chat: { origin: "https://chat.example.com", agentId: "chat-corporativo" } });
    const first = await chat(t, bot.id, "ola");
    expect(first.runs[0]).toMatchObject({ status: "done", reply: "Olá! Em que posso ajudar?" });
    expect(first.runs[0].usage).toMatchObject({ inputTokens: 40, outputTokens: 9, subscription: true });
    const req = fake.seen[0]!;
    expect(req.auth).toBe(`Bearer ${FRESH}`);
    expect(req.origin).toBe("https://chat.example.com");
    expect(req.type).toMatch(/^multipart\/form-data; boundary=/);
    expect(req.path).toBe("/internal/v1/chat-orchestrator");
    expect(req.data).toMatchObject({
      context: { chatId: "" },
      agent: { agentId: "chat-corporativo", version: "1.0.0" },
      input: { role: "user" },
      config: { modelId: "claude-4-6-opus", temperature: 0.25, maxTokens: 64000 },
    });
    expect(req.data.input.content).toContain("You are Ana (@ana)");
    expect(req.data.input.content).toContain("Task:\nola");

    // The next message continues chat-123 and sends only what is new.
    const second = await chat(t, bot.id, "e o preço?");
    expect(second.runs[0].reply).toBe("Continuando: o preço é R$ 2.");
    expect(fake.seen[1]!.data.context.chatId).toBe("chat-123");
    expect(fake.seen[1]!.data.input.content).toContain("Task:\ne o preço?");
    expect(fake.seen[1]!.data.input.content).not.toContain("Task:\nola");
  });

  it("lets the bot use Orbis tools through a ```tool block and answers with the result", async () => {
    const fake = await orchestrator((s, res, n) => {
      if (n === 1) {
        expect(s.data.input.content).toContain("Tools: you can use the tools below");
        return sse(res, [{ content: 'Vou ver quem está na equipe.\n```tool\n{"name": "team.list_bots", "input": {}}\n```' }, { chatId: "c-9" }]);
      }
      // The result comes back as the next message of the same chat.
      expect(s.data.context.chatId).toBe("c-9");
      expect(s.data.input.content).toMatch(/^Result of team\.list_bots:\n/);
      expect(s.data.input.content).toContain('"handle": "ana"');
      return sse(res, [{ content: "Só a Ana está na equipe." }]);
    });
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    const { runs } = await chat(t, bot.id, "quem está na equipe?");
    expect(runs[0]).toMatchObject({ status: "done", reply: "Só a Ana está na equipe." });
    expect(runs[0].steps.map((s: { type: string }) => s.type)).toEqual(["thinking", "tool_call", "tool_result", "text"]);
    expect(fake.seen).toHaveLength(2);
  });

  it("sends the whole run again when the server keeps no chat id", async () => {
    const fake = await orchestrator((_s, res, n) =>
      n === 1 ? sse(res, [{ content: '```tool\n{"name": "team.list_bots", "input": {}}\n```' }]) : sse(res, [{ content: "pronto" }]),
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    expect((await chat(t, bot.id, "liste")).runs[0].reply).toBe("pronto");
    const second = fake.seen[1]!.data;
    expect(second.context.chatId).toBe("");
    expect(second.input.content).toContain("Task:\nliste");
    expect(second.input.content).toContain("--- Your previous answer:");
    expect(second.input.content).toContain("--- Next message:\nResult of team.list_bots:");
  });

  it("starts a new chat when the stored one is gone", async () => {
    const fake = await orchestrator((s, res) => {
      if (s.data.context.chatId === "old-chat") {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end('{"error":"chat not found"}');
      }
      sse(res, [{ content: "novo chat" }, { chatId: "new-chat" }]);
    });
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    t.hub.repos.sessions.set(bot.id, conv.id, "chat-http", "old-chat");
    expect((await chat(t, bot.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "novo chat" });
    expect(t.hub.repos.sessions.get(bot.id, conv.id, "chat-http")).toBe("new-chat");
  });

  it("says the token expired: before calling when it is a JWT past its expiry, and when the server answers 401", async () => {
    const fake = await orchestrator((_s, res) => {
      res.writeHead(401);
      res.end();
    });
    t = await testHub();
    const expired = await chatBot(t, fake.url, {}, jwt(Math.floor(Date.now() / 1000) - 60));
    expect((await chat(t, expired.id, "oi")).runs[0].error).toMatch(
      /^chat-http brain: the Bearer token expired at .+ — paste a new one \(or the request's cURL\) — open Ana's settings/,
    );
    expect(fake.seen).toHaveLength(0);
    await t.api("PUT", `/api/v1/bots/${expired.id}/secrets/CHAT_BEARER_TOKEN`, { value: "not-a-jwt" });
    expect((await chat(t, expired.id, "oi")).runs[0].error).toMatch(/refused the Bearer token \(HTTP 401\): it expired or is wrong/);
  });

  it("tells what is missing before a run: the address, the token", async () => {
    t = await testHub();
    const noUrl = await createBot(t, { name: "Sem URL", brain: { kind: "chat-http" } });
    expect((await chat(t, noUrl.id, "oi")).runs[0].error).toMatch(/^chat-http brain: no address/);
    const noToken = await createBot(t, { name: "Sem Token", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1" } });
    expect((await chat(t, noToken.id, "oi")).runs[0].error).toMatch(/^chat-http brain: no Bearer token/);
  });

  it("leaves the private address out of an exported template", async () => {
    t = await testHub();
    const bot = await chatBot(t, "https://chat.example.com/secret/path");
    const yaml = (await t.api("GET", `/api/v1/bots/${bot.id}/export`)).body as string;
    expect(yaml).toContain("kind: chat-http");
    expect(yaml).not.toContain("chat.example.com");
    expect(yaml).not.toContain(FRESH);
  });
});

describe("reading an orchestrator's answer", () => {
  const read = (lines: string[], type = "text/event-stream") => {
    const r = new AnswerReader();
    for (const l of lines) {
      r.raw += `${l}\n`;
      r.line(l, /event-stream/.test(type));
    }
    r.finish(type);
    return r;
  };

  it("joins deltas, takes a growing answer whole, and skips status and references", () => {
    expect(read(['data: {"delta":{"text":"Ol"}}', 'data: {"delta":{"text":"á"}}', "data: [DONE]"]).text).toBe("Olá");
    expect(read(['data: {"content":"O preço"}', 'data: {"content":"O preço é R$ 2"}', 'data: {"content":"O preço é R$ 2."}']).text).toBe("O preço é R$ 2.");
    expect(read(['data: {"type":"references","content":"doc.pdf"}', 'data: {"type":"message","content":"texto"}']).text).toBe("texto");
    expect(read(['data: {"choices":[{"delta":{"content":"oi"}}]}', 'data: {"choices":[{"delta":{"content":"!"}}]}']).text).toBe("oi!");
    expect(read(['data: {"role":"user","content":"ola"}', 'data: {"role":"assistant","content":"olá!"}']).text).toBe("olá!");
  });

  it("reads JSON lines, one JSON document, and plain text", () => {
    expect(read(['{"content":"a"}', '{"content":"b"}'], "application/x-ndjson").text).toBe("ab");
    expect(read(["{", '  "data": { "answer": "resposta", "chatId": "x1" }', "}"], "application/json")).toMatchObject({ text: "resposta", chatId: "x1" });
    expect(read(["só texto"], "text/plain").text).toBe("só texto");
  });

  it("reports an error event, and gets the chat id wherever it is", () => {
    const r = read(['data: {"type":"error","message":"modelo indisponível"}']);
    expect(r.error).toBe("modelo indisponível");
    expect(read(['data: {"metadata":{"chat_id":"abc"}}', 'data: {"content":"ok"}']).chatId).toBe("abc");
    expect(eventText({ type: "status", message: "Pensando" })).toBeNull();
  });

  it("reads a tool block, and says when it is not JSON", () => {
    expect(toolRequest('Antes.\n```tool\n{"name":"memory.search","input":{"query":"x"}}\n```')).toEqual({
      before: "Antes.",
      name: "memory.search",
      input: { query: "x" },
    });
    expect(toolRequest("```tool\n{name: x}\n```")).toMatchObject({ invalid: expect.stringMatching(/not valid JSON/) });
    expect(toolRequest("sem bloco")).toBeNull();
  });

  it("builds the request's data field", () => {
    expect(chatPayload({ content: "oi", chatId: null, model: "m", options: { temperature: 0.5 } })).toMatchObject({
      context: { chatId: "" },
      input: { role: "user", content: "oi" },
      config: { temperature: 0.5, modelId: "m", maxTokens: 64000 },
      extensions: { features: { enableStreaming: true } },
    });
  });
});

describe("a pasted cURL command", () => {
  const token = jwt(1_790_948_599);
  const command = [
    "curl --url 'https://chat.example.com/internal-api/v1/chat-orchestrator' \\",
    "  -H 'accept: */*' \\",
    `  -H 'authorization: Bearer ${token}' \\`,
    "  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundaryXYZ' \\",
    "  -H 'origin: https://chat.example.com' \\",
    '  --data-raw $\'------WebKitFormBoundaryXYZ\\r\\nContent-Disposition: form-data; name="data"\\r\\n\\r\\n' +
      '{"context":{"chatId":""},"agent":{"agentId":"chat-corporativo","version":"1.0.0"},"input":{"role":"user","content":"ola"},' +
      '"config":{"temperature":0.25,"maxTokens":64000,"modelId":"claude-4-6-opus"}}' +
      "\\r\\n------WebKitFormBoundaryXYZ--\\r\\n'",
  ].join("\n");

  it("gives the address, the token, the agent, the model and the Origin", () => {
    expect(parseCurl(command)).toMatchObject({
      url: "https://chat.example.com/internal-api/v1/chat-orchestrator",
      token,
      agentId: "chat-corporativo",
      agentVersion: "1.0.0",
      model: "claude-4-6-opus",
      temperature: 0.25,
      maxTokens: 64000,
      headers: { origin: "https://chat.example.com", accept: "*/*" },
    });
    expect(tokenExpiry(token)?.toISOString()).toBe(new Date(1_790_948_599_000).toISOString());
    expect(tokenExpiry("not-a-jwt")).toBeNull();
  });

  it("reads Windows' cmd format too", () => {
    const cmd = `curl ^"https://chat.example.com/v1/chat^" ^\n  -H ^"authorization: Bearer ${token}^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"`;
    expect(parseCurl(cmd)).toMatchObject({ url: "https://chat.example.com/v1/chat", token });
    expect(shellWords("a 'b c' \"d e\" $'f\\ng'")).toEqual(["a", "b c", "d e", "f\ng"]);
  });
});

describe("the chats' history, when the answer leaves something out", () => {
  it("reads the reply from the chat's history when the answer holds no text Orbis can read", async () => {
    let sent = "";
    const fake = await orchestrator(
      (s, res) => {
        sent = s.data.input.content;
        sse(res, [{ kind: "done", chatId: "0000aaaa-1111-7000-8000-000000000001" }]);
      },
      (path) =>
        path === "/internal/v1/history/chats/0000aaaa-1111-7000-8000-000000000001"
          ? {
              data: {
                messages: [
                  { role: "user", content: sent },
                  { role: "assistant", content: [{ type: "text", text: "Resposta lida do histórico." }] },
                ],
              },
            }
          : undefined,
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    expect((await chat(t, bot.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "Resposta lida do histórico." });
  });

  it("finds its chat among the newest when the answer names none, never a chat the user has open", async () => {
    let sent = "";
    const fake = await orchestrator(
      (s, res, n) => {
        if (n === 1) sent = s.data.input.content;
        sse(res, [{ content: n === 1 ? "primeira" : "segunda" }]);
      },
      (path) => {
        if (path.startsWith("/internal/v1/history/chats?page=1"))
          return { data: { items: [{ id: "browser-chat", title: "Minha conversa" }, { id: "orbis-chat" }] } };
        if (path === "/internal/v1/history/chats/browser-chat")
          return { data: { messages: [{ role: "user", content: "algo que eu perguntei no navegador" }] } };
        if (path === "/internal/v1/history/chats/orbis-chat")
          return {
            data: {
              messages: [
                { role: "user", content: sent },
                { role: "assistant", content: "primeira" },
              ],
            },
          };
        return undefined;
      },
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    expect((await chat(t, bot.id, "oi")).runs[0].reply).toBe("primeira");
    expect((await chat(t, bot.id, "e agora?")).runs[0].reply).toBe("segunda");
    expect(fake.seen[1]!.data.context.chatId).toBe("orbis-chat");
  });

  it("asks a server without that history once, and says how the answer began", async () => {
    const fake = await orchestrator((_s, res) => sse(res, [{ kind: "something-new", payload: { x: 1 } }]));
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    expect((await chat(t, bot.id, "oi")).runs[0].error).toMatch(
      /^the chat API answered, but Orbis found no text in it; it began with: data: \{"kind":"something-new"/,
    );
    expect(fake.reads).toHaveLength(1);
  });

  it("reads the usual shapes of a chat's messages", () => {
    expect(
      historyMessages([
        { type: "human", text: "q" },
        { type: "ai", text: "a" },
      ]),
    ).toEqual([
      { role: "user", text: "q" },
      { role: "assistant", text: "a" },
    ]);
    expect(historyMessages({ data: [{ input: { content: "q" }, output: { content: "a" } }] })).toEqual([
      { role: "user", text: "q" },
      { role: "assistant", text: "a" },
    ]);
    expect(historyMessages({ turns: [{ userMessage: "q", answer: "a" }] })).toEqual([
      { role: "user", text: "q" },
      { role: "assistant", text: "a" },
    ]);
    const messages = [
      { role: "user" as const, text: "antes" },
      { role: "assistant" as const, text: "velha" },
      // The server may store our message wrapped; it still holds what we sent.
      { role: "user" as const, text: "[chat] sistema\n\nTask:\nnova pergunta" },
      { role: "assistant" as const, text: "nova" },
    ];
    expect(answerAfter(messages, "sistema\n\nTask:\nnova pergunta")).toBe("nova");
    expect(answerAfter(messages, "outra")).toBeNull();
    expect(chatIds({ data: { items: [{ chatId: "a" }, { chatId: "b" }] } })).toEqual(["a", "b"]);
    expect(historyBase("https://chat.example.com/internal-api/v1/chat-orchestrator")).toBe("https://chat.example.com/internal-api/v1/history/chats");
    expect(historyBase("https://chat.example.com/v1/chat", "https://other.example.com/h/")).toBe("https://other.example.com/h");
  });

  it("takes from a pasted history cURL (a GET) its token and the history's address, not the chat's", () => {
    const get = `curl --url 'https://chat.example.com/internal-api/v1/history/chats/0000bbbb-2222?x=1' \\\n  -H 'authorization: Bearer ${FRESH}'`;
    expect(parseCurl(get)).toMatchObject({ hasBody: false, token: FRESH, historyUrl: "https://chat.example.com/internal-api/v1/history/chats" });
    expect(parseCurl("curl --url 'https://chat.example.com/v1/history/chats?page=1&pageSize=10'").historyUrl).toBe("https://chat.example.com/v1/history/chats");
    expect(parseCurl("curl --url 'https://chat.example.com/v1/chat' --data-raw '{}'")).toMatchObject({ hasBody: true, historyUrl: null });
  });
});

describe("a chat history shaped like the owner's company chat (made-up data)", () => {
  /** `GET <history>/<id>` as that chat returns it: data.chat with its messages, each with role, content and usage. */
  const companyChat = (id: string, sent: string, answer: string) => ({
    data: {
      chat: {
        _id: id,
        user: { userName: "Test User", preferredUsername: "test.user@example.com", jobTitle: "Analyst", department: "Testing" },
        currentAgentId: "chat-corporativo",
        kbId: null,
        totalUsage: { completionTokens: 194, promptTokens: 5760, totalTokens: 5954 },
        messageCount: 2,
        title: null,
        fixed: false,
        messages: [
          {
            id: "msg-1",
            order: 0,
            role: "user",
            content: sent,
            model: null,
            usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
            referenceLinks: null,
            followUpQuestions: null,
          },
          {
            id: "chatcmpl-1",
            order: 1,
            role: "assistant",
            content: answer,
            model: "claude-4-6-opus",
            usage: { completionTokens: 194, promptTokens: 5760, totalTokens: 5954 },
            referenceLinks: [],
            followUpQuestions: ["Quer que eu detalhe?", "Posso ajudar com outra coisa?"],
          },
        ],
      },
    },
  });

  it("takes the reply and its tokens from the history, whatever the stream looked like", async () => {
    let sent = "";
    const fake = await orchestrator(
      (s, res) => {
        sent = s.data.input.content;
        // A stream Orbis cannot read as text; the chat's id comes as {"chat": {"_id": …}}.
        sse(res, [
          { kind: "chunk", payload: "Olá, tu" },
          { kind: "chunk", payload: "do ótimo!" },
          { kind: "final", chat: { _id: "chat-abc" } },
        ]);
      },
      (path) =>
        path === "/internal/v1/history/chats/chat-abc"
          ? companyChat("chat-abc", sent, "Olá! Tudo ótimo por aqui 😊\n\nPosso te ajudar com algo hoje?")
          : undefined,
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    const { runs, conversation } = await chat(t, bot.id, "Ola tudo bem como voce esta?");
    expect(runs[0]).toMatchObject({ status: "done", reply: "Olá! Tudo ótimo por aqui 😊\n\nPosso te ajudar com algo hoje?" });
    expect(runs[0].usage).toMatchObject({ inputTokens: 5760, outputTokens: 194, subscription: true });
    expect(t.hub.repos.sessions.get(bot.id, conversation.id, "chat-http")).toBe("chat-abc");
    expect(fake.reads).toEqual(["/internal/v1/history/chats/chat-abc"]);
  });

  it("prefers the history's reply to a stream it read wrong", async () => {
    let sent = "";
    const fake = await orchestrator(
      (s, res) => {
        sent = s.data.input.content;
        // Pieces Orbis would join into the wrong text.
        sse(res, [{ content: "Olá" }, { content: " (referência 1)" }, { content: "Olá! Tudo certo." }, { chatId: "chat-xyz" }]);
      },
      (path) => (path === "/internal/v1/history/chats/chat-xyz" ? companyChat("chat-xyz", sent, "Olá! Tudo certo.") : undefined),
    );
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    expect((await chat(t, bot.id, "oi")).runs[0].reply).toBe("Olá! Tudo certo.");
  });

  it("reads the history's messages and nothing else of the chat (not the user's profile, not the follow-up questions)", () => {
    const doc = companyChat("c", "pergunta", "resposta");
    expect(historyMessages(doc)).toEqual([
      { role: "user", text: "pergunta" },
      { role: "assistant", text: "resposta", usage: { input: 5760, output: 194 } },
    ]);
  });
});

describe("titles of the chats a bot opens", () => {
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  it("titles a new chat once, as the browser does, with the bot's name and the task", async () => {
    titleStatus = 200;
    const fake = await orchestrator((_s, res) => sse(res, [{ content: "ok" }, { chatId: "chat-t1" }]));
    t = await testHub();
    const bot = await chatBot(t, fake.url);
    await chat(t, bot.id, "resuma o relatório de vendas");
    await until(() => fake.titles.length > 0);
    expect(fake.titles).toEqual([
      {
        path: "/internal/v1/history/chats/chat-t1/generate-title",
        type: "application/json",
        auth: `Bearer ${FRESH}`,
        body: { data: { userMessage: "Orbis · Ana — resuma o relatório de vendas" } },
      },
    ]);
    // The next message continues that chat: no new title.
    await chat(t, bot.id, "e o de compras?");
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.titles).toHaveLength(1);
  });

  it("gives no title when the bot is set not to, and a failing title changes nothing", async () => {
    titleStatus = 500;
    const fake = await orchestrator((_s, res) => sse(res, [{ content: "ok" }, { chatId: `chat-${Math.random()}` }]));
    t = await testHub();
    const off = await chatBot(t, fake.url, { chat: { titles: false } });
    expect((await chat(t, off.id, "oi")).runs[0].status).toBe("done");
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.titles).toHaveLength(0);
    const on = await createBot(t, { name: "Bia", brain: { kind: "chat-http", baseUrl: fake.url, apiKeySecret: "CHAT_BEARER_TOKEN" } });
    await t.api("PUT", `/api/v1/bots/${on.id}/secrets/CHAT_BEARER_TOKEN`, { value: FRESH });
    expect((await chat(t, on.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "ok" });
    await until(() => fake.titles.length > 0);
    expect(fake.titles).toHaveLength(1);
    titleStatus = 200;
  });
});

describe("the Bearer token, saved and sent (audit of change 0033)", () => {
  it("cleans the token as pasted: a whole header line, quotes, a wrapped paste", () => {
    for (const pasted of [
      FRESH,
      `Bearer ${FRESH}`,
      `  bearer   ${FRESH}\n`,
      `Authorization: Bearer ${FRESH}`,
      `-H 'authorization: Bearer ${FRESH}' \\`,
      `"${FRESH}"`,
      `${FRESH.slice(0, 40)}\n${FRESH.slice(40, 90)} ${FRESH.slice(90)}`,
    ]) {
      expect(cleanBearer(pasted)).toBe(FRESH);
    }
    expect(cleanBearer("   ")).toBe("");
  });

  it("sends the token the vault holds, bare, whatever way it was pasted", async () => {
    const fake = await orchestrator((_s, res) => sse(res, [{ content: "ok" }, { chatId: "c-tok" }]));
    t = await testHub();
    const bot = await createBot(t, {
      name: "Ana",
      brain: { kind: "chat-http", baseUrl: fake.url, apiKeySecret: "CHAT_BEARER_TOKEN", chat: { titles: false } },
    });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/CHAT_BEARER_TOKEN`, { value: `Authorization: Bearer ${FRESH}\n` });
    expect((await chat(t, bot.id, "oi")).runs[0].status).toBe("done");
    expect(fake.seen[0]!.auth).toBe(`Bearer ${FRESH}`);
    // The history reads carry it too.
    expect(fake.readHeaders.every((h) => h.authorization === `Bearer ${FRESH}`)).toBe(true);
  });

  it("says whether a token is saved and when it expires, never the token", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana", brain: { kind: "chat-http", baseUrl: "http://127.0.0.1:9/x", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/chat-token`)).body).toEqual({ saved: false, expiresAt: null, expired: false });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/CHAT_BEARER_TOKEN`, { value: FRESH });
    const saved = (await t.api("GET", `/api/v1/bots/${bot.id}/chat-token`)).body;
    expect(saved).toMatchObject({ saved: true, expired: false });
    expect(saved.expiresAt).toBe(tokenExpiry(FRESH)!.toISOString());
    expect(JSON.stringify(saved)).not.toContain(FRESH);
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/CHAT_BEARER_TOKEN`, { value: jwt(Math.floor(Date.now() / 1000) - 60) });
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/chat-token`)).body).toMatchObject({ saved: true, expired: true });
  });
});

describe("a refused request (HTTP 403 or 401)", () => {
  const conn = { token: FRESH, transport: transportFor("curl", "/usr/bin/curl") };

  it("tells a token the server refused (401) from a valid token it still refuses (403), with what the server said", () => {
    expect(refusal(401, "", conn)).toMatch(/refused the Bearer token \(HTTP 401\): it expired or is wrong/);
    const forbidden = refusal(403, "<html><body><h1>Access Denied</h1> Reference #18.abc</body></html>", conn);
    expect(forbidden).toContain("HTTP 403");
    expect(forbidden).toContain("its token is valid until");
    expect(forbidden).toContain("Orbis sent the token, through curl: no browser headers were copied");
    expect(forbidden).toContain("The server said: Access Denied Reference #18.abc");
    expect(forbidden).not.toContain("<h1>");
    // With the browser's headers sent, Orbis says how many, and does not blame a header the cURL never had.
    const sent = refusal(403, "", {
      ...conn,
      origin: "https://chat.example.com",
      headers: { "user-agent": "Mozilla/5.0", "accept-language": "pt-BR", "sec-fetch-mode": "cors" },
    });
    expect(sent).toContain("Orbis sent the token, Origin, 3 browser headers, through curl.");
    expect(sent).not.toContain("no browser headers were copied");
    expect(sent).not.toContain("Referer");
    expect(sent).toContain("may lack access to this agent");
    // An expired token is the cause, whatever the status.
    expect(refusal(403, "", { ...conn, token: jwt(Math.floor(Date.now() / 1000) - 5) })).toMatch(/Bearer token expired at/);
    // The token never comes back in the server's words.
    expect(refusal(403, `bad token ${FRESH}`, conn)).not.toContain(FRESH);
  });

  it("names the firewall when Cloudflare is the one that refused, and says what to do through curl or through Node", () => {
    const page =
      "<html><title>Attention Required! | Cloudflare</title><body>Sorry, you have been blocked. You are unable to access chat.example.com</body></html>";
    const viaCurl = refusal(403, page, { ...conn, origin: "https://chat.example.com", headers: { "user-agent": "Mozilla/5.0" } });
    expect(viaCurl).toContain("firewall (Cloudflare) blocked the request (HTTP 403)");
    expect(viaCurl).toContain("through curl");
    expect(viaCurl).toContain("The browser's headers already go with it");
    expect(viaCurl).toContain("press Test connection");
    expect(refusal(403, page, conn)).toContain("Paste the request's cURL in the bot's settings so Orbis copies the browser's headers");
    expect(viaCurl).toContain("Sorry, you have been blocked");
    const viaNode = refusal(403, page, { ...conn, transport: transportFor("fetch", null) });
    expect(viaNode).toContain("through fetch");
    expect(viaNode).toContain("install curl");
  });

  it("builds the headers the browser sent, and never lets one replace the token", () => {
    const headers = requestHeaders(
      { token: FRESH, origin: "https://chat.example.com", headers: { referer: "https://chat.example.com/", authorization: "Bearer other" } },
      "*/*",
    );
    expect(headers).toMatchObject({
      accept: "*/*",
      origin: "https://chat.example.com",
      referer: "https://chat.example.com/",
      authorization: `Bearer ${FRESH}`,
    });
  });

  it("fails the run with the server's reason and what Orbis sent, and sends the saved browser headers when set", async () => {
    const fake = await orchestrator((s, res) => {
      if (s.headers.referer && s.headers["user-agent"] === "Mozilla/5.0 (made up)" && s.origin) return sse(res, [{ content: "ok" }, { chatId: "c-ok" }]);
      res.writeHead(403, { "content-type": "text/html" });
      res.end("<html><h1>Forbidden by policy</h1></html>");
    });
    t = await testHub();
    const bare = await chatBot(t, fake.url, { chat: { titles: false } });
    const refused = (await chat(t, bare.id, "oi")).runs[0];
    expect(refused.status).toBe("failed");
    expect(refused.error).toContain("HTTP 403");
    expect(refused.error).toContain("Forbidden by policy");
    expect(refused.error).toContain("no browser headers were copied");
    expect(refused.error).not.toContain(FRESH);

    const browser = await chatBot(t, fake.url, {
      chat: { titles: false, origin: "https://chat.example.com", headers: { referer: "https://chat.example.com/", "user-agent": "Mozilla/5.0 (made up)" } },
    });
    expect((await chat(t, browser.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "ok" });
  });

  it("keeps only the browser headers Orbis knows, without line breaks", async () => {
    t = await testHub();
    const bad = await t.api("POST", "/api/v1/bots", {
      name: "Ana",
      brain: { kind: "chat-http", baseUrl: "http://127.0.0.1:9/x", chat: { headers: { cookie: "session=1" } } },
    });
    expect(bad.status).toBe(400);
    const crlf = await t.api("POST", "/api/v1/bots", {
      name: "Bia",
      brain: { kind: "chat-http", baseUrl: "http://127.0.0.1:9/x", chat: { headers: { referer: "https://a.example\r\nX-Evil: 1" } } },
    });
    expect(crlf.status).toBe(400);
  });

  it("leaves every address of the brain out of a template: request, Origin, history and browser headers", async () => {
    t = await testHub();
    const bot = await createBot(t, {
      name: "Ana",
      brain: {
        kind: "chat-http",
        baseUrl: "https://chat.example.com/v1/chat",
        apiKeySecret: "CHAT_BEARER_TOKEN",
        chat: {
          agentId: "agente-x",
          origin: "https://app.example.com",
          historyUrl: "https://chat.example.com/v1/history/chats",
          headers: { referer: "https://app.example.com/chat" },
          titles: false,
        },
      },
    });
    const yaml = (await t.api("GET", `/api/v1/bots/${bot.id}/export`)).body as string;
    expect(yaml).toContain("kind: chat-http");
    expect(yaml).toContain("agente-x");
    expect(yaml).toContain("titles: false");
    for (const private_ of ["example.com", "origin", "historyUrl", "referer", "baseUrl"]) expect(yaml).not.toContain(private_);
  });
});

describe("the stream of the company chat (change 0035)", () => {
  /** The events the real chat sends, with made-up words: a start, chunks (the follow-up block among them), the complete message. */
  const stream = (res: ServerResponse, chatId: string, reply: string, extra = "") => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const event = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    event("stream_started", { requestId: "req-1", chatId });
    for (const delta of [...reply.match(/.{1,7}/gs)!, `\n\n[FOLLOW_UP_QUESTIONS]\n["Quer ver mais?", "Posso ajudar?"]\n[/FOLLOW_UP_QUESTIONS]`])
      event("message_chunk", { delta });
    event("message_complete", {
      data: {
        metadata: { requestId: "req-1", chatId, messageId: "chatcmpl-1", tokenUsage: { promptTokens: 6096, completionTokens: 153, totalTokens: 6249 } },
        context: { content: reply, role: "assistant" },
        extensions: { followUpQuestions: ["Quer ver mais?", "Posso ajudar?"] },
      },
    });
    res.end(extra);
  };

  it("takes the answer, the chat and the tokens from message_complete, without the follow-up questions and without the history", async () => {
    titleStatus = 200;
    const fake = await orchestrator((_s, res) => stream(res, "chat-sse-1", "Olá! Estou à disposição para o que precisar. 🚀"));
    t = await testHub();
    const bot = await chatBot(t, fake.url, { chat: { titles: false } });
    const run = (await chat(t, bot.id, "ola")).runs[0];
    expect(run).toMatchObject({ status: "done", reply: "Olá! Estou à disposição para o que precisar. 🚀" });
    expect(run.usage).toMatchObject({ inputTokens: 6096, outputTokens: 153, subscription: true });
    expect(fake.reads).toEqual([]); // the stream said it all: the history was not read
    // The next message continues the chat the stream named.
    await chat(t, bot.id, "e agora?");
    expect(fake.seen[1]!.data.context.chatId).toBe("chat-sse-1");
  });

  it("drops the follow-up block from a streamed answer that has no message_complete", () => {
    expect(stripFollowUps('Oi!\n\n[FOLLOW_UP_QUESTIONS]\n["a", "b"]\n[/FOLLOW_UP_QUESTIONS]')).toBe("Oi!");
    expect(stripFollowUps('Oi!\n\n[FOLLOW_UP_QUESTIONS]\n["a", "b"')).toBe("Oi!");
    expect(stripFollowUps("Sem sugestões.")).toBe("Sem sugestões.");
    const reader = new AnswerReader();
    reader.line(
      'data: {"data": {"metadata": {"chatId": "c1", "tokenUsage": {"promptTokens": 5, "completionTokens": 2}}, "context": {"content": "Pronto.", "role": "assistant"}}}',
      true,
    );
    expect(reader).toMatchObject({ final: "Pronto.", chatId: "c1", usage: { input: 5, output: 2 } });
  });
});

describe("a firewall that wants the browser's headers (change 0035)", () => {
  /** Like a firewall in front of the chat: the request passes only with the headers a browser sends together. */
  const firewall = (s: Seen, res: ServerResponse) => {
    const h = s.headers;
    const browser =
      /Chrome\//.test(String(h["user-agent"])) &&
      h["sec-fetch-mode"] === "cors" &&
      /Chromium/.test(String(h["sec-ch-ua"])) &&
      h["sec-ch-ua-platform"] === '"Windows"';
    if (!browser) {
      res.writeHead(403, { "content-type": "text/html" });
      return res.end("<html><title>Attention Required! | Cloudflare</title><body>Sorry, you have been blocked.</body></html>");
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"delta":"passou"}\n\ndata: {"chatId":"c-fw"}\n\n');
  };
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    "accept-language": "pt-BR,pt;q=0.9",
    "sec-ch-ua": '"Chromium";v="154", "Not A(Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=1, i",
  };

  it("is named in the error when the browser's headers are missing, and passes when they are sent", async () => {
    const fake = await orchestrator(firewall);
    t = await testHub();
    const bare = await chatBot(t, fake.url, { chat: { titles: false, origin: "https://chat.example.com" } });
    const blocked = (await chat(t, bare.id, "oi")).runs[0];
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toContain("firewall (Cloudflare) blocked the request (HTTP 403)");
    expect(blocked.error).toContain("through curl");
    expect(blocked.error).not.toContain(FRESH);

    const browser = await chatBot(t, fake.url, { chat: { titles: false, origin: "https://chat.example.com", headers } });
    expect((await chat(t, browser.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "passou" });
    const sent = fake.seen.at(-1)!.headers;
    // The client hints arrive exactly as the browser wrote them, quotes and all.
    expect(sent["sec-ch-ua"]).toBe('"Chromium";v="154", "Not A(Brand";v="99"');
    expect(sent["priority"]).toBe("u=1, i");
    expect(sent.authorization).toBe(`Bearer ${FRESH}`);
  });

  it("makes the same request through Node's fetch when the bot asks for it", async () => {
    const fake = await orchestrator(firewall);
    t = await testHub();
    const viaNode = await chatBot(t, fake.url, { chat: { titles: false, transport: "fetch", headers } });
    expect((await chat(t, viaNode.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "passou" });
    const blocked = await chatBot(t, fake.url, { chat: { titles: false, transport: "fetch" } });
    expect((await chat(t, blocked.id, "oi")).runs[0].error).toMatch(/through fetch.*install curl/);
  });

  it("keeps every browser header the cURL had, but not a cookie or a key", () => {
    const parsed = parseCurl(
      [
        "curl --url 'https://chat.example.com/v1/chat-orchestrator' \\",
        '  -H \'sec-ch-ua: "Chromium";v="154"\' \\',
        "  -H 'sec-fetch-mode: cors' \\",
        "  -H 'cookie: session=nao-guardar' \\",
        "  -H 'x-api-key: nao-guardar' \\",
        "  -H 'accept-encoding: gzip, br' \\",
        "  -H 'user-agent: Mozilla/5.0' \\",
        "  --data-raw '{}'",
      ].join("\n"),
    );
    expect(browserHeaders(parsed.headers)).toEqual({ "user-agent": "Mozilla/5.0", "sec-ch-ua": '"Chromium";v="154"', "sec-fetch-mode": "cors" });
  });
});

describe("a firewall that lets through only what comes from the company's proxy (change 0037)", () => {
  /** A forward proxy, like a company's: it passes each request on and marks it. */
  let proxy: Server | null = null;
  afterEach(async () => {
    await new Promise<void>((r) => (proxy ? proxy.close(() => r()) : r()));
    proxy = null;
  });
  const startProxy = async () => {
    proxy = createServer((req, res) => {
      const target = new URL(req.url!);
      const out = httpRequest(
        {
          host: target.hostname,
          port: target.port,
          path: `${target.pathname}${target.search}`,
          method: req.method,
          headers: { ...req.headers, "x-via-company-proxy": "yes" },
        },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(res);
        },
      );
      req.pipe(out);
    });
    await new Promise<void>((r) => proxy!.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(proxy!.address() as AddressInfo).port}`;
  };
  /** The firewall: only requests that came through the proxy pass. */
  const firewall = (s: Seen, res: ServerResponse) => {
    if (s.headers["x-via-company-proxy"] !== "yes") {
      res.writeHead(403, { "content-type": "text/html" });
      return res.end("<html><title>Attention Required! | Cloudflare</title><body>Sorry, you have been blocked.</body></html>");
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"delta":"pelo proxy"}\n\ndata: {"chatId":"c-px"}\n\n');
  };
  const history = (path: string, headers: IncomingHttpHeaders) =>
    headers["x-via-company-proxy"] !== "yes"
      ? { status: 403, html: "<html><title>Attention Required! | Cloudflare</title><body>Sorry, you have been blocked.</body></html>" }
      : path.includes("pageSize=1")
        ? { data: { chats: [] } }
        : undefined;

  it("is passed through the proxy the bot names, and refused without it", async () => {
    const fake = await orchestrator(firewall);
    const via = await startProxy();
    t = await testHub();
    const direct = await chatBot(t, fake.url, { chat: { titles: false, proxy: "direct" } });
    const refused = (await chat(t, direct.id, "oi")).runs[0];
    expect(refused.error).toContain("firewall (Cloudflare) blocked the request");
    expect(refused.error).toContain("through curl with no proxy");
    expect(refused.error).toContain("press Test connection");
    const proxied = await chatBot(t, fake.url, { chat: { titles: false, proxy: via } });
    expect((await chat(t, proxied.id, "oi")).runs[0]).toMatchObject({ status: "done", reply: "pelo proxy" });
  });

  it("uses the Windows proxy when the bot names none, and leaves the environment's to curl", async () => {
    const asked: string[] = [];
    const systemProxy = async (url: string) => (asked.push(url), "http://proxy.company.example:8080");
    const win = await resolveTransport({}, "https://chat.example.com/v1/chat", { env: {}, platform: "win32", systemProxy, curl: "/usr/bin/curl" });
    expect(win.label).toBe("curl via the proxy http://proxy.company.example:8080");
    expect(asked).toEqual(["https://chat.example.com/v1/chat"]);
    const fromEnv = await resolveTransport({}, "https://chat.example.com/v1/chat", {
      env: { HTTPS_PROXY: "http://env-proxy:3128" },
      platform: "win32",
      systemProxy,
      curl: "/usr/bin/curl",
    });
    expect(fromEnv.label).toBe("curl"); // curl reads HTTPS_PROXY itself
    expect(
      (await resolveTransport({ proxy: "direct" }, "https://chat.example.com/v1/chat", { env: {}, platform: "win32", systemProxy, curl: "/usr/bin/curl" }))
        .label,
    ).toBe("curl with no proxy");
    expect((await resolveTransport({}, "https://chat.example.com/v1/chat", { env: {}, platform: "linux", systemProxy, curl: "/usr/bin/curl" })).label).toBe(
      "curl",
    );
    expect(
      (await resolveTransport({ transport: "fetch" }, "https://chat.example.com/v1/chat", { env: {}, platform: "win32", systemProxy, curl: "/usr/bin/curl" }))
        .label,
    ).toBe("fetch");
    expect(asked).toHaveLength(1);
  });

  it("tests every way out and says which one the firewall lets through, sending no message", async () => {
    const fake = await orchestrator(firewall, history);
    const via = await startProxy();
    t = await testHub();
    const bot = await chatBot(t, fake.url, { chat: { titles: false } });
    const found = await checkConnection({ ...bot, brain: { ...bot.brain, chat: { proxy: via } } }, FRESH, {
      env: { PATH: process.env.PATH },
      platform: "linux",
    });
    expect(found.proxies).toEqual({ windows: null, env: null });
    expect(found.url).toMatch(/\/internal\/v1\/history\/chats$/);
    const byWay = Object.fromEntries(found.results.map((r) => [`${r.transport}:${r.proxy ?? "default"}`, r.verdict]));
    expect(byWay).toMatchObject({ [`curl:${via}`]: "ok", "curl:direct": "blocked", "fetch:default": "blocked" });
    expect(fake.seen).toHaveLength(0); // no message was posted to the chat
    // From the hub's API, for the bot as saved.
    await t.api("PATCH", `/api/v1/bots/${bot.id}`, { brain: { ...bot.brain, chat: { titles: false, proxy: via } } });
    const res = await t.api("POST", `/api/v1/bots/${bot.id}/chat-check`);
    expect(res.status).toBe(200);
    expect(res.body.results.find((r: { proxy: string | null; transport: string }) => r.transport === "curl" && r.proxy === via).verdict).toBe("ok");
    expect(JSON.stringify(res.body)).not.toContain(FRESH);
  });

  it("finds the Windows proxy for an address from what PowerShell says, and nothing for a direct one", async () => {
    let script = "";
    const run = async (s: string) => ((script = s), "http://proxy.company.example:8080/\r\n");
    expect(await windowsProxy("https://chat.example.com/v1/chat?x=1", run)).toBe("http://proxy.company.example:8080");
    expect(script).toContain("[Uri]'https://chat.example.com/v1/chat'"); // no query string
    expect(script).toContain("GetSystemWebProxy()");
    expect(await windowsProxy("https://chat.example.com/", async () => "DIRECT\r\n")).toBeNull();
    expect(await windowsProxy("https://chat.example.com/", async () => "")).toBeNull();
    expect(await windowsProxy("https://chat.example.com/it's", async (s) => ((script = s), "DIRECT"))).toBeNull();
    expect(script).toContain("it''s"); // a quote in the address cannot end PowerShell's string
  });

  it("keeps the curl program and the proxy out of a template, both ways", async () => {
    t = await testHub();
    const bot = await createBot(t, {
      name: "Ana",
      brain: {
        kind: "chat-http",
        baseUrl: "https://chat.example.com/v1/chat",
        chat: { agentId: "agente-x", curl: "/usr/bin/curl", proxy: "http://proxy.company.example:8080" },
      },
    });
    const yaml = (await t.api("GET", `/api/v1/bots/${bot.id}/export`)).body as string;
    expect(yaml).not.toContain("proxy");
    expect(yaml).not.toContain("/usr/bin/curl");
    const planted = yaml.replace("agentId: agente-x", "agentId: agente-x\n      curl: /tmp/evil/curl\n      proxy: http://attacker.example:1");
    expect(planted).toContain("/tmp/evil/curl");
    const imported = (await t.api("POST", "/api/v1/bots/import", { yaml: planted })).body;
    expect(imported.brain.chat).toEqual({ agentId: "agente-x" });
    // And the API refuses a program that is not curl.
    expect((await t.api("POST", "/api/v1/bots", { name: "Bia", brain: { kind: "chat-http", chat: { curl: "C:\\\\x\\\\evil.exe" } } })).status).toBe(400);
  });
});
