// The Anthropic Messages API brain on the official SDK: a streaming manual tool
// loop, because Orbis owns the step limit, cancellation and the approval-gated
// tool gateway (specs/agent-runtimes, ADR 0003).
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageParam, BetaTool, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { chatTurns } from "./history.js";
import { costOf } from "./pricing.js";
import { renderSystem } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput } from "./types.js";
import { toWireName } from "../tools/registry.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const MAX_TOKENS = 64_000;

/** Models that take `thinking: {type: "adaptive"}` (older ones and Haiku do not). */
export function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|fable|mythos)/.test(model);
}

/** Models for which Orbis opts into the server-side refusal fallback. */
export function wantsRefusalFallback(model: string, baseUrl: string | undefined): boolean {
  if (baseUrl) return false; // proxies and gateways may reject the beta
  return /^claude-(opus-5(-5)?|fable-5-1)$/.test(model);
}

function apiKeyFor(input: BrainInput, ctx: BrainContext): string | null {
  const named = input.bot.brain.apiKeySecret;
  if (named) return ctx.secret(named);
  return ctx.config.anthropicApiKey;
}

export function buildAnthropicRequest(input: BrainInput, ctx: BrainContext) {
  const model = input.bot.brain.model ?? DEFAULT_ANTHROPIC_MODEL;
  const tools: BetaTool[] = ctx.tools.list().map((t) => ({
    name: toWireName(t.name),
    description: t.description,
    input_schema: t.inputSchema as unknown as BetaTool["input_schema"],
    // Inputs stream as generated; the gateway validates each against its schema before running it.
    eager_input_streaming: true,
  }));
  const messages: BetaMessageParam[] = chatTurns(input).map((t) => ({ role: t.role, content: t.text }));
  const fallback = wantsRefusalFallback(model, input.bot.brain.baseUrl);
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text" as const, text: renderSystem(input), cache_control: { type: "ephemeral" as const } }],
    messages,
    ...(tools.length ? { tools } : {}),
    ...(supportsAdaptiveThinking(model) ? { thinking: { type: "adaptive" as const, display: "summarized" as const } } : {}),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export const anthropicBrain: BrainAdapter = {
  kind: "anthropic",

  check(bot, config, secret) {
    const key = bot.brain.apiKeySecret ? secret(bot.brain.apiKeySecret) : config.anthropicApiKey;
    if (!key) {
      return bot.brain.apiKeySecret
        ? /^[A-Z][A-Z0-9_]{0,63}$/.test(bot.brain.apiKeySecret)
          ? `anthropic brain: no API key saved for this bot (secret ${bot.brain.apiKeySecret}) — paste it in the bot's settings, in API key`
          : "anthropic brain: the key's secret name is not a name (it looks like the key itself) — paste the key in the bot's settings, in API key"
        : "anthropic brain: no API key (set ANTHROPIC_API_KEY or the bot's apiKeySecret)";
    }
    return null;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const client = new Anthropic({
      apiKey: apiKeyFor(input, ctx)!,
      ...(input.bot.brain.baseUrl ? { baseURL: input.bot.brain.baseUrl } : {}),
      maxRetries: 2,
    });
    const request = buildAnthropicRequest(input, ctx);
    const messages = request.messages;
    const maxSteps = input.bot.brain.maxSteps ?? 25;
    yield { type: "run.started" };

    let lastText = "";
    let toldLast = false;
    for (let step = 0; step < maxSteps; step++) {
      let message: BetaMessage;
      // The last step answers with what the bot has, instead of failing at the limit with nothing.
      const last = step === maxSteps - 1 && step > 0 && Array.isArray(request.tools) && request.tools.length > 0;
      if (last && !toldLast) {
        toldLast = true;
        const tail = messages[messages.length - 1];
        const note = { type: "text" as const, text: `You have used ${step} steps, the most this task allows. Do not call tools any more: answer now with what you found, and say what is left undone.` };
        if (tail?.role === "user" && Array.isArray(tail.content)) tail.content = [...tail.content, note];
        else messages.push({ role: "user", content: [note] });
      }
      try {
        const stream = client.beta.messages.stream({ ...request, messages, ...(last ? { tool_choice: { type: "none" as const } } : {}) }, { signal: ctx.signal });
        message = await stream.finalMessage();
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        if (err instanceof Anthropic.APIError) {
          yield { type: "run.failed", error: `Anthropic API ${err.status ?? ""}: ${err.message}`.trim() };
          return;
        }
        // A tool input the SDK could not parse at all: re-issue the turn once.
        if (step + 1 < maxSteps) continue;
        yield { type: "run.failed", error: err instanceof Error ? err.message : String(err) };
        return;
      }

      const u = message.usage;
      yield {
        type: "run.usage",
        inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens,
        cachedTokens: u.cache_read_input_tokens ?? 0,
        costUsd: costOf(message.model, {
          input: u.input_tokens,
          output: u.output_tokens,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
        }, ctx.config.prices),
        subscription: false,
      };

      const texts: string[] = [];
      for (const block of message.content) {
        if (block.type === "thinking" && block.thinking.trim()) yield { type: "step.thinking", text: block.thinking };
        else if (block.type === "text" && block.text.trim()) {
          texts.push(block.text);
          yield { type: "step.text", text: block.text };
        }
      }
      if (texts.length) lastText = texts.join("\n\n");

      if (message.stop_reason === "refusal") {
        const category = message.stop_details && "category" in message.stop_details ? message.stop_details.category : null;
        yield { type: "run.failed", error: `the model declined this request${category ? ` (${category})` : ""}` };
        return;
      }
      const toolUses = message.content.filter((b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use");
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      if (toolUses.length === 0) {
        yield { type: "run.finished", reply: lastText };
        return;
      }
      if (message.stop_reason === "max_tokens") {
        yield { type: "run.failed", error: "a tool call was cut off at max_tokens; nothing was executed" };
        return;
      }

      messages.push({ role: "assistant", content: message.content });
      const results: BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        yield { type: "step.tool_call", callId: use.id, tool: use.name, input: use.input };
        const result = await ctx.tools.call(use.name, use.input, use.id);
        yield { type: "step.tool_result", callId: use.id, tool: use.name, output: result.output, isError: result.isError };
        results.push({ type: "tool_result", tool_use_id: use.id, content: result.output, ...(result.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    yield { type: "run.failed", error: `the run reached its step limit (${maxSteps} steps)` };
  },
};
