// specs/agent-runtimes — acceptance criterion 3 (OpenAI-compatible adapter with
// streaming and function calling, against a fake Chat Completions server).
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { completionsUrl, isLocalBaseUrl, keyHeaders, openaiBrain } from "../../src/brains/openai.js";
import { createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

async function fakeChatApi(): Promise<{ url: string; requests: Array<{ body: any; auth?: string }> }> {
  const requests: Array<{ body: any; auth?: string }> = [];
  server = createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    requests.push({ body, auth: req.headers.authorization });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const hasToolResult = body.messages.some((m: { role: string }) => m.role === "tool");
    if (!hasToolResult) {
      // The function call arrives in fragments, the way servers stream it.
      res.write(data({ choices: [{ index: 0, delta: { role: "assistant", content: "Let me check. " } }] }));
      res.write(data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "team_list", arguments: "" } }] } }] }));
      res.write(data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "_bots", arguments: "{}" } }] } }] }));
      res.write(data({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }));
      res.write(data({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 5 } } }));
    } else {
      res.write(data({ choices: [{ index: 0, delta: { content: "One bot: " } }] }));
      res.write(data({ choices: [{ index: 0, delta: { content: "@llama." } }] }));
      res.write(data({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
      res.write(data({ choices: [], usage: { prompt_tokens: 80, completion_tokens: 4 } }));
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`, requests };
}

describe("openai-compatible brain", () => {
  it("executes a streamed function call through the gateway and emits the final text and usage (criterion 3)", async () => {
    const api = await fakeChatApi();
    t = await testHub();
    // A local base URL (Ollama, LM Studio, vLLM) needs no API key.
    const bot = await createBot(t, { name: "Llama", brain: { kind: "openai", model: "llama3.2", baseUrl: api.url } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "who is on the team?" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);

    expect(run.error).toBeNull();
    expect(run.reply).toBe("One bot: @llama.");
    expect(run.steps.map((s) => s.type)).toEqual(["text", "tool_call", "tool_result", "text"]);
    expect(run.steps[1]).toMatchObject({ tool: "team_list_bots", callId: "call_1", input: {} });
    expect(run.steps[2]!.output).toContain(`"handle": "llama"`);
    expect(run.usage).toMatchObject({ inputTokens: 130, outputTokens: 14, cachedTokens: 5, costUsd: 0 });

    const [first, second] = api.requests;
    expect(first!.auth).toBeUndefined();
    expect(first!.body).toMatchObject({ model: "llama3.2", stream: true, stream_options: { include_usage: true } });
    expect(first!.body.messages[0].role).toBe("system");
    expect(first!.body.tools.map((x: { function: { name: string } }) => x.function.name)).toContain("team_list_bots");
    expect(second!.body.messages.at(-2)).toMatchObject({ role: "assistant", tool_calls: [{ id: "call_1", function: { name: "team_list_bots", arguments: "{}" } }] });
    expect(second!.body.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });

  it("needs a model, and a key for remote servers", async () => {
    t = await testHub();
    const noModel = await createBot(t, { name: "A", brain: { kind: "openai" } });
    const remote = await createBot(t, { name: "B", brain: { kind: "openai", model: "gpt-5" } });
    for (const [bot, error] of [[noModel, /no model configured/], [remote, /no API key for https:\/\/api.openai.com\/v1/]] as const) {
      const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
      const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "hi" });
      expect((await t.hub.engine.wait(posted.body.runs[0].id)).error).toMatch(error);
    }
    expect(isLocalBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalBaseUrl("https://openrouter.ai/api/v1")).toBe(false);
  });
});

describe("an OpenAI-compatible gateway as a company runs it (change 0041)", () => {
  /** A gateway like Azure OpenAI's: the model in the path, the key in an `api-key` header, a JSON answer (no stream). */
  async function gateway() {
    const seen: Array<{ path: string; apiKey?: string; auth?: string; body: any }> = [];
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      seen.push({ path: req.url ?? "", apiKey: req.headers["api-key"] as string | undefined, auth: req.headers.authorization, body });
      res.writeHead(200, { "content-type": "application/json" });
      const hasToolResult = body.messages.some((m: { role: string }) => m.role === "tool");
      const message = hasToolResult
        ? { role: "assistant", content: "A equipe tem um bot.", tool_calls: null }
        : { role: "assistant", content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "team_list_bots", arguments: "{}" } }] };
      res.end(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          choices: [{ index: 0, finish_reason: hasToolResult ? "stop" : "tool_calls", message, content_filter_results: {} }],
          usage: { prompt_tokens: 108, completion_tokens: 96, total_tokens: 204 },
        }),
      );
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    return { base: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1/openai/deployments/{model}`, seen };
  }

  it("puts the model in the address, sends the key as api-key, and reads a non-streamed answer with a tool call", async () => {
    const gw = await gateway();
    t = await testHub();
    const bot = await createBot(t, { name: "Ana", brain: { kind: "openai", model: "gpt-4.1-mini", baseUrl: gw.base, apiKeySecret: "API_KEY", apiKeyHeader: "api-key" } });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/API_KEY`, { value: "chave-de-teste" });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "quem está na equipe?" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.error).toBeNull();
    expect(run.reply).toBe("A equipe tem um bot.");
    expect(run.steps.map((s) => s.type)).toEqual(["tool_call", "tool_result", "text"]);
    expect(run.usage).toMatchObject({ inputTokens: 216, outputTokens: 192 });
    expect(gw.seen.map((r) => r.path)).toEqual(["/v1/openai/deployments/gpt-4.1-mini/chat/completions", "/v1/openai/deployments/gpt-4.1-mini/chat/completions"]);
    expect(gw.seen[0]).toMatchObject({ apiKey: "chave-de-teste", auth: undefined });
  });

  it("asks again without the stream when the gateway only answers stream: false", async () => {
    const bodies: any[] = [];
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      bodies.push(body);
      if (body.stream) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "stream is not supported by this deployment" } }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Olá!" } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    t = await testHub();
    const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/deployments/{model}`;
    const bot = await createBot(t, { name: "Ana", tools: [], brain: { kind: "openai", model: "gpt-4o-mini", baseUrl: base, apiKeySecret: "API_KEY", apiKeyHeader: "api-key" } });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/API_KEY`, { value: "chave-de-teste" });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "oi" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.error).toBeNull();
    expect(run.reply).toBe("Olá!");
    expect(bodies.map((b) => [b.stream, "stream_options" in b])).toEqual([
      [true, true],
      [false, false],
    ]);
  });

  it("sends the key as a Bearer token by default", () => {
    expect(keyHeaders("k", undefined)).toEqual({ authorization: "Bearer k" });
    expect(keyHeaders("k", "bearer")).toEqual({ authorization: "Bearer k" });
    expect(keyHeaders("k", "api-key")).toEqual({ "api-key": "k" });
    expect(keyHeaders(null, "api-key")).toEqual({});
    expect(completionsUrl("https://gw.example.com/v1", "gpt-4o")).toBe("https://gw.example.com/v1/chat/completions");
    expect(completionsUrl("https://gw.example.com/deployments/{model}", "a b")).toBe("https://gw.example.com/deployments/a%20b/chat/completions");
  });

  it("moves a key pasted where its secret's name goes into the vault, masks it where it was quoted, and never echoes it", async () => {
    t = await testHub();
    const pasted = "9Z9Z-0000-made-up-key-value";
    // Before the fix the settings took any text here; the API now refuses a value that is not a name.
    expect((await t.api("POST", "/api/v1/bots", { name: "Bia", brain: { kind: "openai", model: "gpt-4o", apiKeySecret: pasted } })).status).toBe(400);
    const bot = await createBot(t, { name: "Ana", brain: { kind: "openai", model: "gpt-4o", baseUrl: "https://gw.example.com/v1" } });
    t.hub.repos.bots.save({ ...t.hub.botService.get(bot.id), brain: { kind: "openai", model: "gpt-4o", baseUrl: "https://gw.example.com/v1", apiKeySecret: pasted } });
    // What the old message left behind, and what the check now says: never the value.
    expect(openaiBrain.check(t.hub.botService.get(bot.id), t.hub.config, () => null)).toMatch(/is not a name \(it looks like the key itself\)/);
    expect(openaiBrain.check(t.hub.botService.get(bot.id), t.hub.config, () => null)).not.toContain(pasted);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    t.hub.timeline.event(conv.id, "run.failed", `Ana: openai brain: secret ${pasted} is not set for this bot`);

    expect(t.hub.secrets.moveMisplacedKeys()).toBe(1);
    expect(t.hub.botService.get(bot.id).brain.apiKeySecret).toBe("API_KEY");
    expect(t.hub.secrets.vault.get(bot.id, "API_KEY")).toBe(pasted);
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body as Array<{ text: string }>;
    expect(items.at(-1)!.text).toBe("Ana: openai brain: secret •••• is not set for this bot");
    expect(JSON.stringify((await t.api("GET", `/api/v1/bots/${bot.id}`)).body)).not.toContain(pasted);
    expect(t.hub.secrets.moveMisplacedKeys()).toBe(0); // once
  });
});
