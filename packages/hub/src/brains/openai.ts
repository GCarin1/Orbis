// The OpenAI-compatible brains: Chat Completions with streaming and function
// calling, for OpenAI, OpenRouter, Groq, vLLM and any server that speaks the
// same shape (`openai`), and for the local Ollama and LM Studio servers
// (`ollama`, `lmstudio`) at their default addresses (specs/agent-runtimes).
import type { Bot, BrainKind } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { costOf } from "./pricing.js";
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

/**
 * Reasoning models served locally (Qwen3, DeepSeek-R1) write their reasoning
 * inside <think>…</think> in the answer: it is thinking, not the reply. An
 * unclosed block (the model stopped while thinking) is thinking too.
 */
export function splitThinking(content: string): { thinking: string; text: string } {
  const thinking: string[] = [];
  let text = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner: string) => {
    thinking.push(inner.trim());
    return "";
  });
  const open = text.search(/<think>/i);
  if (open >= 0) {
    thinking.push(text.slice(open + 7).trim());
    text = text.slice(0, open);
  }
  return { thinking: thinking.filter(Boolean).join("\n\n"), text: text.trim() };
}

/** Statuses worth one more try after a pause: rate limits and a busy or restarting server. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 6_000];

/** How long to wait before retrying: the server's Retry-After (at most 30 s), or the next default delay. */
export function retryDelay(res: Pick<Response, "headers">, attempt: number): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 30_000);
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

/** Servers that answer "this model cannot use tools" instead of ignoring them (Ollama does). */
const NO_TOOL_SUPPORT = /does not support tools|tools? (?:are|is) not supported|not support(?:ed)? (?:for )?tool/i;

interface CompatibleOptions {
  kind: Extract<BrainKind, "openai" | "ollama" | "lmstudio">;
  /** The base URL when the bot names none. */
  baseUrl(config: HubConfig): string;
  /** Examples for the missing-model message. */
  modelHint: string;
  /** Use OPENAI_API_KEY for bots with no key secret (the remote `openai` brain only). */
  envKey: boolean;
}

function makeCompatibleBrain(o: CompatibleOptions): BrainAdapter {
  const baseUrlOf = (bot: Bot, config: HubConfig) => (bot.brain.baseUrl ?? o.baseUrl(config)).replace(/\/+$/, "");
  const keyOf = (bot: Bot, config: HubConfig, secret: (name: string) => string | null) =>
    bot.brain.apiKeySecret ? secret(bot.brain.apiKeySecret) : o.envKey ? config.openaiApiKey : null;

  return {
    kind: o.kind,

    check(bot, config, secret) {
      if (!bot.brain.model) return `${o.kind} brain: no model configured (${o.modelHint})`;
      const baseUrl = baseUrlOf(bot, config);
      if (o.envKey && isLocalBaseUrl(baseUrl)) return null;
      if (bot.brain.apiKeySecret && !secret(bot.brain.apiKeySecret)) return `${o.kind} brain: secret ${bot.brain.apiKeySecret} is not set for this bot`;
      // Ollama and LM Studio take no key unless the bot names one.
      if (o.envKey && !keyOf(bot, config, secret)) return `openai brain: no API key for ${baseUrl} (set OPENAI_API_KEY or the bot's apiKeySecret)`;
      return null;
    },

    run: (input, ctx) => runCompatible(input, ctx, baseUrlOf(input.bot, ctx.config), keyOf(input.bot, ctx.config, ctx.secret)),
  };
}

export const openaiBrain = makeCompatibleBrain({
  kind: "openai",
  baseUrl: () => DEFAULT_OPENAI_BASE_URL,
  modelHint: "for example gpt-5, llama3.2, qwen3",
  envKey: true,
});

export const ollamaBrain = makeCompatibleBrain({
  kind: "ollama",
  baseUrl: (config) => config.ollamaBaseUrl,
  modelHint: "for example llama3.2 or qwen3; `ollama list` shows the models you have",
  envKey: false,
});

export const lmstudioBrain = makeCompatibleBrain({
  kind: "lmstudio",
  baseUrl: (config) => config.lmstudioBaseUrl,
  modelHint: "the id of a model downloaded in LM Studio",
  envKey: false,
});

async function* runCompatible(input: BrainInput, ctx: BrainContext, baseUrl: string, key: string | null): AsyncGenerator<BrainEvent> {
  let tools = ctx.tools.list().map((t) => ({
    type: "function" as const,
    function: { name: toWireName(t.name), description: t.description, parameters: t.inputSchema },
  }));
  const messages: ChatMessage[] = [
    { role: "system", content: renderSystem(input) },
    ...chatTurns(input).map((t) => (t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: t.text })),
  ];
  const maxSteps = input.bot.brain.maxSteps ?? 25;
  let includeUsage = true;
  let retries = 0;
  yield { type: "run.started" };

  for (let step = 0; step < maxSteps; step++) {
    // The last step answers with what the bot has, instead of failing at the limit with nothing.
    const last = step === maxSteps - 1 && tools.length > 0;
    if (last) {
      messages.push({
        role: "user",
        content: `You have used ${maxSteps - 1} steps, the most this task allows. Do not call tools any more: answer now with what you found, and say what is left undone.`,
      });
    }
    const body = {
      model: input.bot.brain.model,
      messages,
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      ...(tools.length && !last ? { tools } : {}),
    };
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      const why = cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err));
      yield {
        type: "run.failed",
        error: `could not reach ${baseUrl} (${why}): is the ${input.bot.brain.kind === "lmstudio" ? "LM Studio server" : input.bot.brain.kind === "ollama" ? "Ollama server" : "server"} running and the address right?`,
      };
      return;
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      // A rate limit or a busy server: wait and try the same step again, twice at most.
      if (RETRYABLE.has(res.status) && retries < RETRY_DELAYS_MS.length) {
        const wait = retryDelay(res, retries);
        retries++;
        yield { type: "step.thinking", text: `${baseUrl} answered HTTP ${res.status}; trying again in ${Math.round(wait / 1000)}s.` };
        await sleep(wait, ctx.signal);
        step--;
        continue;
      }
      // Some compatible servers reject stream_options: retry once without it.
      if (res.status === 400 && includeUsage && /stream_options/i.test(text)) {
        includeUsage = false;
        step--;
        continue;
      }
      // Many local models cannot call tools: answer without them rather than fail.
      if (res.status >= 400 && res.status < 500 && tools.length && NO_TOOL_SUPPORT.test(text)) {
        tools = [];
        yield { type: "step.thinking", text: `${input.bot.brain.model} does not support tools here; answering without them.` };
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
        const input_ = Number(chunk.usage.prompt_tokens ?? 0);
        const output = Number(chunk.usage.completion_tokens ?? 0);
        const cached = Number(chunk.usage.prompt_tokens_details?.cached_tokens ?? 0);
        yield {
          type: "run.usage",
          inputTokens: input_,
          outputTokens: output,
          cachedTokens: cached,
          // Zero for models the table does not price (local servers), unless prices.json names them.
          costUsd: costOf(input.bot.brain.model ?? "", { input: input_ - cached, output, cacheRead: cached }, ctx.config.prices),
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

    retries = 0;
    const split = splitThinking(content);
    if (split.thinking) yield { type: "step.thinking", text: split.thinking };
    if (split.text) yield { type: "step.text", text: split.text };
    // Some servers end a turn that calls tools with finish_reason "stop": the calls decide, not the label.
    const toolCalls = [...calls.entries()]
      .filter(([, c]) => c.name)
      .sort(([a], [b]) => a - b)
      .map(([, c], i) => ({ ...c, id: c.id || `call_${step}_${i}` }));
    if (toolCalls.length === 0) {
      yield { type: "run.finished", reply: split.text };
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
}
