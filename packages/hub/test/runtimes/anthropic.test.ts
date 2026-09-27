// specs/agent-runtimes — acceptance criterion 2 (anthropic adapter against a
// fake Messages API that speaks real server-sent events to the official SDK).
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildAnthropicRequest, supportsAdaptiveThinking, wantsRefusalFallback } from "../../src/brains/anthropic.js";
import { costOf } from "../../src/brains/pricing.js";
import type { BrainContext, BrainInput } from "../../src/brains/types.js";
import { createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: "thinking"; thinking: string };

/** SSE for one assistant message, event by event as the Messages API sends it. */
function sse(blocks: Block[], stopReason: string, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 40, cache_creation_input_tokens: 10 }): string {
  const events: Array<[string, unknown]> = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } }],
  ];
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]);
    } else if (block.type === "thinking") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig" } }]);
    } else {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

async function fakeMessagesApi(respond: (body: any, n: number) => string): Promise<{ url: string; requests: Array<{ body: any; headers: IncomingMessage["headers"]; url: string }> }> {
  const requests: Array<{ body: any; headers: IncomingMessage["headers"]; url: string }> = [];
  server = createServer(async (req, res) => {
    const body = await readJson(req);
    requests.push({ body, headers: req.headers, url: req.url ?? "" });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(respond(body, requests.length));
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, requests };
}

describe("anthropic brain", () => {
  it("runs a tool_use through the gateway, returns the tool_result, emits the final text and records usage (criterion 2)", async () => {
    const api = await fakeMessagesApi((body, n) =>
      n === 1
        ? sse([{ type: "thinking", thinking: "I should list the team." }, { type: "tool_use", id: "toolu_1", name: "team_list_bots", input: {} }], "tool_use")
        : sse([{ type: "text", text: "The team has one bot: @ana." }], "end_turn"),
    );
    t = await testHub({ config: { anthropicApiKey: "sk-ant-test" } });
    const bot = await createBot(t, { brain: { kind: "anthropic", baseUrl: api.url } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "who is on the team?" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);

    expect(run.error).toBeNull();
    expect(run.status).toBe("done");
    expect(run.reply).toBe("The team has one bot: @ana.");
    expect(run.steps.map((s) => s.type)).toEqual(["thinking", "tool_call", "tool_result", "text"]);
    expect(run.steps[2]).toMatchObject({ tool: "team_list_bots", isError: false });
    expect(run.steps[2]!.output).toContain('"handle": "@ana"');
    // Two turns of 100 input + 10 cache write, 20 output, 40 cache read each.
    expect(run.usage).toMatchObject({ inputTokens: 220, outputTokens: 40, cachedTokens: 80, subscription: false });
    expect(run.usage.costUsd).toBeCloseTo(2 * costOf("claude-opus-5", { input: 100, output: 20, cacheRead: 40, cacheWrite: 10 }), 8);

    const [first, second] = api.requests;
    expect(first!.headers["x-api-key"]).toBe("sk-ant-test");
    expect(first!.body.model).toBe("claude-opus-5");
    expect(first!.body.stream).toBe(true);
    expect(first!.body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(first!.body.system[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(first!.body.system[0].text).toContain("You are Ana (@ana)");
    expect(first!.body.tools.map((x: { name: string }) => x.name)).toContain("team_list_bots");
    expect(first!.body.tools.every((x: { eager_input_streaming: boolean }) => x.eager_input_streaming)).toBe(true);
    expect(first!.body.messages).toEqual([{ role: "user", content: "who is on the team?" }]);
    // The second turn carries the assistant turn back unchanged and the tool result.
    expect(second!.body.messages[1].role).toBe("assistant");
    expect(second!.body.messages[1].content.map((b: { type: string }) => b.type)).toEqual(["thinking", "tool_use"]);
    expect(second!.body.messages[2]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1" }] });
  });

  it("fails on a refusal and on a tool call cut off at max_tokens, executing nothing", async () => {
    const api = await fakeMessagesApi((body) =>
      String(body.messages.at(-1).content).includes("refuse")
        ? sse([], "refusal")
        : sse([{ type: "tool_use", id: "toolu_9", name: "conversation_post", input: { text: "par" } }], "max_tokens"),
    );
    t = await testHub({ config: { anthropicApiKey: "sk-ant-test" } });
    const bot = await createBot(t, { brain: { kind: "anthropic", baseUrl: api.url } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const a = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "please refuse" });
    expect((await t.hub.engine.wait(a.body.runs[0].id)).error).toMatch(/declined/);
    const b = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "post something" });
    const run = await t.hub.engine.wait(b.body.runs[0].id);
    expect(run.error).toMatch(/cut off at max_tokens/);
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.some((i: { text: string }) => i.text === "par")).toBe(false);
  });

  it("fails fast without an API key", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: { kind: "anthropic" } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "hi" });
    expect((await t.hub.engine.wait(posted.body.runs[0].id)).error).toMatch(/no API key/);
  });

  it("opts into the server-side refusal fallback on first-party Opus 5, Opus 5.5 and Fable 5.1 only", () => {
    expect(wantsRefusalFallback("claude-opus-5", undefined)).toBe(true);
    expect(wantsRefusalFallback("claude-fable-5-1", undefined)).toBe(true);
    expect(wantsRefusalFallback("claude-opus-5", "http://proxy")).toBe(false);
    expect(wantsRefusalFallback("claude-sonnet-5", undefined)).toBe(false);
    expect(supportsAdaptiveThinking("claude-haiku-4-5")).toBe(false);
    expect(supportsAdaptiveThinking("claude-sonnet-5")).toBe(true);

    const input = {
      runId: "r",
      bot: { name: "Ana", handle: "ana", brain: { kind: "anthropic" } },
      conversationId: null,
      task: "hi",
      skill: null,
      context: { identity: "You are Ana", memories: [], history: [] },
    } as unknown as BrainInput;
    const ctx = { tools: { list: () => [], call: async () => ({ output: "", isError: false }) } } as unknown as BrainContext;
    const req = buildAnthropicRequest(input, ctx);
    expect(req).toMatchObject({ model: "claude-opus-5", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect("tools" in req).toBe(false);
  });
});

describe("pricing", () => {
  it("prices tokens per model and knows nothing of local models", () => {
    expect(costOf("claude-opus-5", { input: 1_000_000, output: 1_000_000 })).toBe(30);
    expect(costOf("claude-sonnet-5", { input: 1_000_000, output: 0, cacheRead: 1_000_000 })).toBeCloseTo(2.2, 6);
    expect(costOf("claude-opus-5-5", { input: 0, output: 1_000_000 })).toBe(20);
    expect(costOf("llama3.2", { input: 1_000_000, output: 1_000_000 })).toBe(0);
  });
});
