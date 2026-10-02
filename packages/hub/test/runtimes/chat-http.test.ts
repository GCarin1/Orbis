// specs/agent-runtimes — the chat-http brain (change 0029-chat-http-brain): a
// chat orchestrator over HTTPS with a Bearer token, replayed by a fake server.
// The address and token here are made up; Orbis's code holds neither.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { parseCurl, shellWords, tokenExpiry } from "@orbis/shared";
import { AnswerReader, chatPayload, eventText, toolRequest } from "../../src/brains/chat-http.js";
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

/** A fake orchestrator: `answer` writes each response; every request is recorded. */
async function orchestrator(answer: (seen: Seen, res: ServerResponse, n: number) => void) {
  const seen: Seen[] = [];
  server = createServer(async (req, res) => {
    const s: Seen = {
      auth: req.headers.authorization,
      origin: req.headers.origin,
      type: req.headers["content-type"],
      path: req.url,
      data: await dataField(req),
    };
    seen.push(s);
    answer(s, res, seen.length);
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/internal/v1/chat-orchestrator`, seen };
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
