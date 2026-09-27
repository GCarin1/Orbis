// The OpenAI-compatible brain: Chat Completions with streaming and function
// calling, for OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM and any server
// that speaks the same shape (specs/agent-runtimes).
import { chatTurns } from "./history.js";
import { renderSystem } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput } from "./types.js";
import { toWireName } from "../tools/registry.js";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".local") || host === "host.docker.internal";
  } catch {
    return false;
  }
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

/** Parse a server-sent event stream of `data:` lines into JSON chunks. */
export async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, any>> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data) as Record<string, any>;
      } catch {
        /* ignore keep-alives and partial garbage */
      }
    }
  }
}

function apiKey(input: BrainInput, ctx: BrainContext): string | null {
  if (input.bot.brain.apiKeySecret) return ctx.secret(input.bot.brain.apiKeySecret);
  return ctx.config.openaiApiKey;
}

export const openaiBrain: BrainAdapter = {
  kind: "openai",

  check(bot, config, secret) {
    if (!bot.brain.model) return "openai brain: no model configured (for example gpt-5, llama3.2, qwen3)";
    const baseUrl = bot.brain.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    if (isLocalBaseUrl(baseUrl)) return null;
    const key = bot.brain.apiKeySecret ? secret(bot.brain.apiKeySecret) : config.openaiApiKey;
    if (!key) {
      return bot.brain.apiKeySecret
        ? `openai brain: secret ${bot.brain.apiKeySecret} is not set for this bot`
        : `openai brain: no API key for ${baseUrl} (set OPENAI_API_KEY or the bot's apiKeySecret)`;
    }
    return null;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const baseUrl = (input.bot.brain.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
    const key = apiKey(input, ctx);
    const tools = ctx.tools.list().map((t) => ({
      type: "function" as const,
      function: { name: toWireName(t.name), description: t.description, parameters: t.inputSchema },
    }));
    const messages: ChatMessage[] = [
      { role: "system", content: renderSystem(input) },
      ...chatTurns(input).map((t) => (t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: t.text })),
    ];
    const maxSteps = input.bot.brain.maxSteps ?? 25;
    let includeUsage = true;
    yield { type: "run.started" };

    for (let step = 0; step < maxSteps; step++) {
      const body = {
        model: input.bot.brain.model,
        messages,
        stream: true,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
        ...(tools.length ? { tools } : {}),
      };
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        // Some compatible servers reject stream_options: retry once without it.
        if (res.status === 400 && includeUsage && /stream_options/i.test(text)) {
          includeUsage = false;
          step--;
          continue;
        }
        yield { type: "run.failed", error: `${baseUrl} answered HTTP ${res.status}: ${text.slice(0, 500)}` };
        return;
      }

      let content = "";
      let finish: string | null = null;
      const calls = new Map<number, ToolCallAccumulator>();
      for await (const chunk of sseChunks(res.body)) {
        if (chunk.error) {
          yield { type: "run.failed", error: String(chunk.error.message ?? JSON.stringify(chunk.error)) };
          return;
        }
        if (chunk.usage) {
          yield {
            type: "run.usage",
            inputTokens: Number(chunk.usage.prompt_tokens ?? 0),
            outputTokens: Number(chunk.usage.completion_tokens ?? 0),
            cachedTokens: Number(chunk.usage.prompt_tokens_details?.cached_tokens ?? 0),
            costUsd: 0,
            subscription: false,
          };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          /* reasoning tokens are not shown step by step */
        }
        if (typeof delta.content === "string") content += delta.content;
        for (const tc of delta.tool_calls ?? []) {
          const index = Number(tc.index ?? 0);
          const acc = calls.get(index) ?? { id: "", name: "", arguments: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          calls.set(index, acc);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }

      if (content.trim()) yield { type: "step.text", text: content };
      const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, c], i) => ({ ...c, id: c.id || `call_${step}_${i}` }));
      if (toolCalls.length === 0 || finish === "stop") {
        yield { type: "run.finished", reply: content };
        return;
      }
      if (finish === "length") {
        yield { type: "run.failed", error: "a tool call was cut off at the length limit; nothing was executed" };
        return;
      }

      messages.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
      });
      for (const call of toolCalls) {
        let args: unknown;
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          yield { type: "step.tool_call", callId: call.id, tool: call.name, input: call.arguments };
          const output = `invalid JSON arguments for ${call.name}`;
          yield { type: "step.tool_result", callId: call.id, tool: call.name, output, isError: true };
          messages.push({ role: "tool", tool_call_id: call.id, content: output });
          continue;
        }
        yield { type: "step.tool_call", callId: call.id, tool: call.name, input: args };
        const result = await ctx.tools.call(call.name, args, call.id);
        yield { type: "step.tool_result", callId: call.id, tool: call.name, output: result.output, isError: result.isError };
        messages.push({ role: "tool", tool_call_id: call.id, content: result.isError ? `ERROR: ${result.output}` : result.output });
      }
    }
    yield { type: "run.failed", error: `the run reached its step limit (${maxSteps} steps)` };
  },
};
