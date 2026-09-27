// specs/agent-runtimes — acceptance criterion 3 (OpenAI-compatible adapter with
// streaming and function calling, against a fake Chat Completions server).
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { isLocalBaseUrl } from "../../src/brains/openai.js";
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
    expect(run.steps[2]!.output).toContain("@llama");
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
