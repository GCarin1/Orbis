// A chat orchestrator over HTTPS as a brain (specs/agent-runtimes: chat-http):
// the request a browser makes to a company chat — a `multipart/form-data` POST
// with one `data` field holding the message and the chat settings, and a
// Bearer token. The address and the token are the user's (the bot's `baseUrl`
// and a bot secret); this file names neither.
//
// The orchestrator calls no tools of its own, so Orbis's tools travel as text:
// the bot is told how to ask for one in a ```tool block, Orbis runs it through
// the gateway and sends the result back as the next message.
import { CHAT_HTTP_DEFAULT_MODEL, CHAT_HTTP_TOKEN_SECRET, tokenExpiry, type Bot, type ChatHttpOptions } from "@orbis/shared";
import { renderSystem, renderTask } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput, ToolDescriptor } from "./types.js";

/** The request's `data` field. */
export function chatPayload(o: { content: string; chatId: string | null; model: string; options: ChatHttpOptions }): Record<string, unknown> {
  return {
    context: { chatId: o.chatId ?? "" },
    agent: { agentId: o.options.agentId || "chat-corporativo", version: o.options.agentVersion || "1.0.0" },
    input: { role: "user", content: o.content },
    config: {
      temperature: o.options.temperature ?? 0.25,
      maxTokens: o.options.maxTokens ?? 64_000,
      isAdvancedMode: true,
      enableOtherModels: true,
      maxTokensSeleted: "Médio",
      maxTemperatureSelected: "Preciso",
      modelId: o.model,
    },
    extensions: { features: { enableThinking: false, enableStreaming: true, returnReferences: false, numberChatHistoryMessages: 25 } },
  };
}

/** The token as stored, without a "Bearer " the user may have pasted with it. */
export const bareToken = (token: string) => token.trim().replace(/^Bearer\s+/i, "");

const secretName = (bot: Bot) => bot.brain.apiKeySecret || CHAT_HTTP_TOKEN_SECRET;

// --- reading the answer ------------------------------------------------------------------

/** Events that carry no answer text (a status, references, a title, a heartbeat). */
const NOT_TEXT = /status|meta|referenc|citation|source|title|ping|heartbeat|usage|progress|log|start|init|suggest/i;
const TEXT_KEYS = ["content", "text", "delta", "answer", "response", "output", "message", "token", "chunk", "completion", "result"] as const;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** The answer text an event carries, or null. */
export function eventText(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value;
  if (!isObject(value) || depth > 4) return null;
  const type = typeof value.type === "string" ? value.type : typeof value.event === "string" ? value.event : "";
  if (type && NOT_TEXT.test(type) && !/delta|content|text|message|chunk|token|answer/i.test(type)) return null;
  if (value.role === "user" || value.role === "system") return null;
  const choices = value.choices;
  if (Array.isArray(choices) && isObject(choices[0])) return eventText(choices[0].delta ?? choices[0].message ?? choices[0].text, depth + 1);
  for (const key of TEXT_KEYS) {
    const v = value[key];
    if (typeof v === "string") return v;
    if (isObject(v)) {
      const inner = eventText(v, depth + 1);
      if (inner !== null) return inner;
    }
  }
  return isObject(value.data) ? eventText(value.data, depth + 1) : null;
}

/** The first value of a key matching `name` (at most 4 levels down). */
function findKey(value: unknown, name: RegExp, depth = 0): unknown {
  if (!isObject(value) || depth > 4) return undefined;
  for (const [k, v] of Object.entries(value)) if (name.test(k) && v !== null && v !== undefined && v !== "") return v;
  for (const v of Object.values(value)) {
    const found = findKey(v, name, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** What one answer held: its text, the chat id the server gave it, an error, usage. */
export class AnswerReader {
  text = "";
  chatId: string | null = null;
  error: string | null = null;
  usage = { input: 0, output: 0 };
  /** The answer as received, for a message when no text was found in it. */
  raw = "";
  private events = 0;

  feed(value: unknown): void {
    this.events++;
    if (isObject(value)) {
      const err = value.error ?? (typeof value.type === "string" && /error/i.test(value.type) ? (value.message ?? value.detail) : undefined);
      if (err) this.error = typeof err === "string" ? err : isObject(err) && typeof err.message === "string" ? err.message : JSON.stringify(err).slice(0, 300);
      const id = findKey(value, /^(chat_?id|conversation_?id)$/i);
      if (typeof id === "string" && !this.chatId) this.chatId = id;
      const usage = findKey(value, /^usage$/i);
      if (isObject(usage)) {
        this.usage.input = Math.max(this.usage.input, Number(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0);
        this.usage.output = Math.max(this.usage.output, Number(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0) || 0);
      }
    }
    const chunk = eventText(value);
    if (chunk === null || chunk === "") return;
    // A server may send each piece (a delta) or the whole answer so far: a piece
    // that starts with all the text so far is the whole answer, not more of it.
    if (this.text.length >= 3 && chunk.length >= this.text.length && chunk.startsWith(this.text)) this.text = chunk;
    else this.text += chunk;
  }

  /** One line of a streamed answer: server-sent events, JSON lines, or plain text from an event stream. */
  line(line: string, eventStream: boolean): void {
    const trimmed = line.trim();
    if (!trimmed || /^(event|id|retry):/.test(trimmed) || trimmed.startsWith(":")) return;
    const payload = trimmed.startsWith("data:") ? line.slice(line.indexOf("data:") + 5).replace(/^ /, "") : trimmed;
    if (payload.trim() === "[DONE]") return;
    try {
      this.feed(JSON.parse(payload));
    } catch {
      if (eventStream) this.feed(payload);
    }
  }

  /** After the last line: a body that was one JSON document or plain text. */
  finish(contentType: string): void {
    if (this.text || this.error) return;
    const body = this.raw.trim();
    if (!body) return;
    try {
      this.feed(JSON.parse(body));
      return;
    } catch {
      /* not one JSON document */
    }
    if (!/json|event-stream/i.test(contentType) && !body.startsWith("{") && !body.startsWith("[")) this.text = body;
  }

  get empty(): boolean {
    return this.events === 0 && !this.raw.trim();
  }
}

// --- tools as text ----------------------------------------------------------------------------

const TOOL_BLOCK = /```tool[^\n]*\n([\s\S]*?)```/;

/** How the bot asks for a tool, and the tools it has (a compact schema each). */
export function toolProtocol(tools: ToolDescriptor[]): string {
  const lines = tools.map((t) => {
    const schema = t.inputSchema as { properties?: Record<string, { type?: unknown; description?: string }>; required?: string[] };
    const params = Object.entries(schema.properties ?? {})
      .map(([name, p]) => `${name}${schema.required?.includes(name) ? "" : "?"}: ${Array.isArray(p.type) ? p.type.join("|") : (p.type ?? "any")}`)
      .join(", ");
    return `- ${t.name}(${params}): ${t.description.replace(/\s+/g, " ").slice(0, 300)}`;
  });
  return [
    "Tools: you can use the tools below. To use one, answer with only this block and nothing after it:",
    "```tool",
    '{"name": "tool.name", "input": {"param": "value"}}',
    "```",
    "The result comes back as the next message; then continue. One tool at a time. When you have the answer, write it normally, with no tool block.",
    ...lines,
  ].join("\n");
}

/** The tool a reply asks for, the text before it, or a reason the block is unreadable. */
export function toolRequest(reply: string): { before: string; name: string; input: unknown } | { before: string; invalid: string } | null {
  const m = TOOL_BLOCK.exec(reply);
  if (!m) return null;
  const before = reply.slice(0, m.index).trim();
  try {
    const call = JSON.parse(m[1]!) as { name?: unknown; tool?: unknown; input?: unknown; arguments?: unknown };
    const name = typeof call.name === "string" ? call.name : typeof call.tool === "string" ? call.tool : null;
    if (!name) return { before, invalid: 'the block has no "name"' };
    return { before, name, input: call.input ?? call.arguments ?? {} };
  } catch (err) {
    return { before, invalid: `the block is not valid JSON (${err instanceof Error ? err.message : String(err)})` };
  }
}

// --- the brain --------------------------------------------------------------------------------

class HttpFailure extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

async function ask(url: string, token: string, payload: Record<string, unknown>, origin: string | undefined, signal: AbortSignal): Promise<AnswerReader> {
  const form = new FormData();
  form.append("data", JSON.stringify(payload));
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { accept: "*/*", authorization: `Bearer ${token}`, ...(origin ? { origin } : {}) }, body: form, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* keep what the user gave */
    }
    throw new HttpFailure(
      `could not reach ${host} (${cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err))}): check the address and your network (VPN)`,
      null,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new HttpFailure(
      `the server refused the Bearer token (HTTP ${res.status}): it expired or is wrong — paste a new token (or the request's cURL) in the bot's settings`,
      res.status,
    );
  }
  if (!res.ok || !res.body) {
    const text = (await res.text().catch(() => "")).slice(0, 400);
    throw new HttpFailure(`the chat API answered HTTP ${res.status}${text ? `: ${text}` : ""}`, res.status);
  }
  const reader = new AnswerReader();
  const type = res.headers.get("content-type") ?? "";
  const eventStream = /event-stream/i.test(type);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    const chunk = decoder.decode(part, { stream: true });
    if (reader.raw.length < 100_000) reader.raw += chunk;
    buffer += chunk;
    let cut: number;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      reader.line(buffer.slice(0, cut), eventStream);
      buffer = buffer.slice(cut + 1);
    }
  }
  if (buffer.trim()) reader.line(buffer, eventStream);
  reader.finish(type);
  return reader;
}

export const chatHttpBrain: BrainAdapter = {
  kind: "chat-http",

  check(bot, _config, secret) {
    const url = bot.brain.baseUrl?.trim();
    if (!url) return "chat-http brain: no address — paste the chat API's URL (or the request's cURL) in the bot's settings";
    try {
      if (!/^https?:$/.test(new URL(url).protocol)) throw new Error("not http");
    } catch {
      return "chat-http brain: the address is not an http(s) URL";
    }
    const token = secret(secretName(bot));
    if (!token?.trim()) return "chat-http brain: no Bearer token — paste it (or the request's cURL) in the bot's settings";
    const expires = tokenExpiry(bareToken(token));
    if (expires && expires.getTime() <= Date.now()) {
      return `chat-http brain: the Bearer token expired at ${expires.toLocaleString()} — paste a new one (or the request's cURL)`;
    }
    return null;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const bot = input.bot;
    const url = bot.brain.baseUrl!.trim();
    const token = bareToken(ctx.secret(secretName(bot)) ?? "");
    const options = bot.brain.chat ?? {};
    const model = bot.brain.model?.trim() || CHAT_HTTP_DEFAULT_MODEL;
    const tools = ctx.tools.list();
    const system = [renderSystem(input), tools.length ? toolProtocol(tools) : ""].filter(Boolean).join("\n\n");
    const maxSteps = bot.brain.maxSteps ?? 25;
    yield { type: "run.started" };

    // The server keeps a chat's history when it returns its id: later messages
    // of the run, and later runs of this conversation, continue that chat.
    let chatId = ctx.sessions.get();
    const opening = (resumed: boolean) => `${system}\n\n${renderTask(input, resumed)}`;
    /** The run so far as turns, for a server that keeps no history (no chat id). */
    const turns: Array<{ role: "user" | "assistant"; text: string }> = [{ role: "user", text: opening(chatId !== null) }];
    const transcript = () =>
      turns.map((t, i) => (i === 0 ? t.text : t.role === "assistant" ? `--- Your previous answer:\n${t.text}` : `--- Next message:\n${t.text}`)).join("\n\n");
    let triedFresh = chatId === null;
    let toldLast = false;

    for (let step = 0; step < maxSteps; step++) {
      if (step === maxSteps - 1 && tools.length && !toldLast) {
        toldLast = true;
        turns.push({
          role: "user",
          text: `You have used ${step} steps, the most this task allows. Do not use tools any more: answer now with what you found, and say what is left undone.`,
        });
      }
      // With a chat the server remembers, only the newest message goes; without one, the whole run.
      const content = chatId !== null && step > 0 ? turns.at(-1)!.text : chatId !== null ? turns[0]!.text : transcript();
      let answer: AnswerReader;
      try {
        answer = await ask(url, token, chatPayload({ content, chatId, model, options }), options.origin, ctx.signal);
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        // A stored chat the server no longer has: start a new one, with the whole conversation.
        if (
          err instanceof HttpFailure &&
          err.status !== null &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 401 &&
          err.status !== 403 &&
          !triedFresh
        ) {
          triedFresh = true;
          chatId = null;
          ctx.sessions.clear();
          turns.splice(0, turns.length, { role: "user", text: opening(false) });
          step--;
          continue;
        }
        yield { type: "run.failed", error: err instanceof Error ? err.message : String(err) };
        return;
      }
      if (answer.usage.input || answer.usage.output) {
        yield { type: "run.usage", inputTokens: answer.usage.input, outputTokens: answer.usage.output, cachedTokens: 0, costUsd: 0, subscription: true };
      }
      if (answer.error && !answer.text) {
        yield { type: "run.failed", error: `the chat API reported: ${answer.error}` };
        return;
      }
      if (answer.chatId && answer.chatId !== chatId) {
        chatId = answer.chatId;
        ctx.sessions.set(chatId);
      }
      const reply = answer.text.trim();
      if (!reply) {
        const start = answer.raw.trim().slice(0, 300);
        yield {
          type: "run.failed",
          error: answer.empty ? "the chat API answered with nothing" : `the chat API answered, but Orbis found no text in it; it began with: ${start}`,
        };
        return;
      }
      turns.push({ role: "assistant", text: reply });

      const request = tools.length && !toldLast ? toolRequest(reply) : null;
      if (!request) {
        const final = toldLast ? reply.replace(TOOL_BLOCK, "").trim() || reply : reply;
        yield { type: "step.text", text: final };
        yield { type: "run.finished", reply: final };
        return;
      }
      if (request.before) yield { type: "step.thinking", text: request.before };
      if ("invalid" in request) {
        turns.push({ role: "user", text: `Your tool block could not be read: ${request.invalid}. Write it again, as JSON with "name" and "input".` });
        continue;
      }
      const callId = `chat_${step}`;
      yield { type: "step.tool_call", callId, tool: request.name, input: request.input };
      const result = await ctx.tools.call(request.name, request.input, callId);
      yield { type: "step.tool_result", callId, tool: request.name, output: result.output, isError: result.isError };
      turns.push({ role: "user", text: `Result of ${request.name}${result.isError ? " (error)" : ""}:\n${result.output}` });
    }
    yield { type: "run.failed", error: `the run reached its step limit (${maxSteps} steps)` };
  },
};
