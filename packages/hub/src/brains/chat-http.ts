// A chat orchestrator over HTTPS as a brain (specs/agent-runtimes: chat-http):
// the request a browser makes to a company chat — a `multipart/form-data` POST
// with one `data` field holding the message and the chat settings, and a
// Bearer token. The address and the token are the user's (the bot's `baseUrl`
// and a bot secret); this file names neither.
//
// The orchestrator calls no tools of its own, so Orbis's tools travel as text:
// the bot is told how to ask for one in a ```tool block, Orbis runs it through
// the gateway and sends the result back as the next message.
import { CHAT_HTTP_DEFAULT_MODEL, CHAT_HTTP_TOKEN_SECRET, cleanBearer, tokenExpiry, type Bot, type ChatHttpOptions } from "@orbis/shared";
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

/** The token as stored, without the "Bearer " (or a whole `Authorization:` line, quotes, line breaks) the user may have pasted with it. */
export const bareToken = cleanBearer;

/** What every request to the chat API carries: the token, and what the browser sent besides it. */
export interface Connection {
  token: string;
  origin?: string;
  headers?: Record<string, string>;
}

const connectionOf = (token: string, options: ChatHttpOptions): Connection => ({
  token,
  ...(options.origin ? { origin: options.origin } : {}),
  ...(options.headers ? { headers: options.headers } : {}),
});

/** The request headers: what the user's browser sent besides the token, then the token (which is never overridden). */
export function requestHeaders(conn: Connection, accept: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    accept,
    ...(conn.headers ?? {}),
    ...(conn.origin ? { origin: conn.origin } : {}),
    ...extra,
    authorization: `Bearer ${conn.token}`,
  };
}

/** The first words of an error page, without its markup or the token. */
function bodyHint(body: string, token: string): string {
  const text = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (token ? text.split(token).join("[token]") : text).slice(0, 300);
}

/**
 * Why a server answered 401 or 403. A 401 is the token. A 403 with a token that
 * has not expired is the server refusing something else — usually what the
 * browser sends besides the token — so the message says what Orbis sent and
 * what is left to try.
 */
export function refusal(status: number, body: string, conn: Connection): string {
  const hint = bodyHint(body, conn.token);
  const said = hint ? ` The server said: ${hint}` : "";
  const expires = tokenExpiry(conn.token);
  if (status === 401) {
    return `the server refused the Bearer token (HTTP 401): it expired or is wrong — paste a new token (or the request's cURL) in the bot's settings.${said}`;
  }
  if (expires && expires.getTime() <= Date.now()) {
    return `the server refused the request (HTTP ${status}) and the Bearer token expired at ${expires.toLocaleString()}: paste a new token (or the request's cURL) in the bot's settings.${said}`;
  }
  const sent = ["the token", ...(conn.origin ? ["Origin"] : []), ...Object.keys(conn.headers ?? {})].join(", ");
  const missing = [...(conn.origin ? [] : ["Origin"]), ...(conn.headers?.referer ? [] : ["Referer"]), ...(conn.headers?.["user-agent"] ? [] : ["User-Agent"])];
  const when = expires ? `the token is valid until ${expires.toLocaleString()}` : "the token's expiry is unknown";
  return (
    `the server refused the request (HTTP ${status}); ${when}, so it is refusing something else. Orbis sent ${sent}` +
    (missing.length
      ? `, not ${missing.join(", ")}: the browser sends them — paste the request's cURL in the bot's settings (Chat API over cURL) so Orbis copies them`
      : "") +
    `. If it still fails, the account may lack access to this agent, or the address is not the one the chat posts to.${said}`
  );
}

const secretName = (bot: Bot) => bot.brain.apiKeySecret || CHAT_HTTP_TOKEN_SECRET;

// --- reading the answer ------------------------------------------------------------------

/** Events that carry no answer text (a status, references, a title, a heartbeat). */
const NOT_TEXT = /status|meta|referenc|citation|source|title|ping|heartbeat|usage|progress|log|start|init|suggest/i;
const TEXT_KEYS = ["content", "text", "delta", "answer", "response", "output", "message", "token", "chunk", "completion", "result"] as const;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Token counts in the usual spellings (inputTokens, input_tokens, prompt_tokens, promptTokens…). */
export function usageOf(value: unknown): { input: number; output: number } | null {
  if (!isObject(value)) return null;
  const input = Number(value.inputTokens ?? value.input_tokens ?? value.promptTokens ?? value.prompt_tokens ?? 0) || 0;
  const output = Number(value.outputTokens ?? value.output_tokens ?? value.completionTokens ?? value.completion_tokens ?? 0) || 0;
  return input || output ? { input, output } : null;
}

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
      // The chat's id: a chatId-like key, or the id of a `chat` object ({"chat": {"_id": …}}).
      const named = findKey(value, /^(chat_?id|conversation_?id)$/i);
      const chat = findKey(value, /^chat$/i);
      const id = typeof named === "string" ? named : isObject(chat) ? (chat._id ?? chat.id) : undefined;
      if (typeof id === "string" && id && !this.chatId) this.chatId = id;
      const usage = usageOf(findKey(value, /^(usage|totalUsage)$/i));
      if (usage) {
        this.usage.input = Math.max(this.usage.input, usage.input);
        this.usage.output = Math.max(this.usage.output, usage.output);
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

async function ask(url: string, conn: Connection, payload: Record<string, unknown>, signal: AbortSignal): Promise<AnswerReader> {
  const form = new FormData();
  form.append("data", JSON.stringify(payload));
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: requestHeaders(conn, "*/*"), body: form, signal });
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
    throw new HttpFailure(refusal(res.status, await res.text().catch(() => ""), conn), res.status);
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

// --- the chats' history ------------------------------------------------------------------------

/** The history address: the one the user gave, or `history/chats` beside the chat address. */
export function historyBase(chatUrl: string, explicit?: string): string | null {
  try {
    if (explicit?.trim()) return new URL(explicit.trim()).toString().replace(/\/+$/, "");
    return new URL("history/chats", chatUrl).toString();
  } catch {
    return null;
  }
}

export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  /** The tokens of an answer, when the history records them. */
  usage?: { input: number; output: number } | null;
}

/** A message's words: a string, parts of text, or an object holding them. */
function messageText(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map((p) => messageText(p, depth + 1)).filter((p): p is string => Boolean(p));
    return parts.length ? parts.join("") : null;
  }
  if (!isObject(value) || depth > 3) return null;
  for (const key of ["content", "text", "message", "body", "value"]) {
    const t = messageText(value[key], depth + 1);
    if (t) return t;
  }
  return null;
}

const USER_ROLE = /^(user|human|me|usuario|usuário)$/i;
const ASSISTANT_ROLE = /assistant|^ai$|bot|model|agent|assistente/i;
const USER_KEY = /^(input|question|prompt|user_?message|pergunta)$/i;
const ASSISTANT_KEY = /^(output|answer|response|reply|assistant_?message|resposta)$/i;

/** The messages of a chat as the history returns it, in order, whatever its shape. */
export function historyMessages(doc: unknown): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  const walk = (value: unknown, key: string, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const v of value) walk(v, key, depth + 1);
      return;
    }
    if (typeof value === "string") {
      if (USER_KEY.test(key)) out.push({ role: "user", text: value });
      else if (ASSISTANT_KEY.test(key)) out.push({ role: "assistant", text: value });
      return;
    }
    if (!isObject(value)) return;
    const roleValue = [value.role, value.type, value.sender, value.author, value.from].find((v) => typeof v === "string") as string | undefined;
    const role =
      roleValue && USER_ROLE.test(roleValue)
        ? "user"
        : roleValue && ASSISTANT_ROLE.test(roleValue)
          ? "assistant"
          : USER_KEY.test(key)
            ? "user"
            : ASSISTANT_KEY.test(key)
              ? "assistant"
              : null;
    const text = role ? messageText(value) : null;
    if (role && text) {
      out.push({ role, text, ...(role === "assistant" && usageOf(value.usage) ? { usage: usageOf(value.usage) } : {}) });
      return;
    }
    for (const [k, v] of Object.entries(value)) walk(v, k, depth + 1);
  };
  walk(doc, "", 0);
  return out;
}

/** The end of what was sent, to find it again in a history (it may be stored trimmed or wrapped). */
const sentMark = (sent: string) => sent.trim().slice(-200).trim();

/** The answer that follows our message in a chat's history, or null when our message is not there. */
export function answerAfter(messages: HistoryMessage[], sent: string): string | null {
  return replyAfter(messages, sent)?.text ?? null;
}

/** The answer after our message, with its tokens when the history records them. */
export function replyAfter(messages: HistoryMessage[], sent: string): { text: string; usage: { input: number; output: number } | null } | null {
  const mark = sentMark(sent);
  let at = -1;
  messages.forEach((m, i) => {
    if (m.role === "user" && m.text.includes(mark)) at = i;
  });
  if (at < 0) return null;
  const answers: HistoryMessage[] = [];
  for (let i = at + 1; i < messages.length && messages[i]!.role === "assistant"; i++) answers.push(messages[i]!);
  if (!answers.length) return null;
  const usage = answers.reduce<{ input: number; output: number } | null>(
    (sum, m) => (m.usage ? { input: (sum?.input ?? 0) + m.usage.input, output: (sum?.output ?? 0) + m.usage.output } : sum),
    null,
  );
  return { text: answers.map((m) => m.text).join("\n\n"), usage };
}

/** The chat ids a list of chats holds, in its order. */
export function chatIds(doc: unknown): string[] {
  const ids: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || ids.length) return;
    if (Array.isArray(value)) {
      const found = value
        .map((v) => (isObject(v) ? (v.chatId ?? v.id ?? v._id ?? v.uuid) : undefined))
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      if (found.length) ids.push(...found);
      else for (const v of value) walk(v, depth + 1);
      return;
    }
    if (isObject(value)) for (const v of Object.values(value)) walk(v, depth + 1);
  };
  walk(doc, 0);
  return ids;
}

/** The message a new chat's title is generated from: the bot's name and the task, so the user tells Orbis's chats apart. */
export function titleMessage(botName: string, task: string): string {
  const text = `Orbis · ${botName} — ${task.replace(/\s+/g, " ").trim()}`;
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

/**
 * Ask the server to title a new chat, as the browser does after the first
 * message. Best effort: it never holds up nor fails the run.
 */
export async function generateTitle(base: string, chatId: string, conn: Connection, userMessage: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/${encodeURIComponent(chatId)}/generate-title`, {
      method: "POST",
      headers: requestHeaders(conn, "application/json, text/plain, */*", { "content-type": "application/json" }),
      body: JSON.stringify({ data: { userMessage } }),
      signal: AbortSignal.timeout(60_000),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

async function getJson(url: string, conn: Connection, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { headers: requestHeaders(conn, "application/json, text/plain, */*"), signal });
  if (!res.ok) throw new HttpFailure(`the history answered HTTP ${res.status}`, res.status);
  return res.json();
}

/**
 * Our chat and its answer, from the history: the chat given, or — when the
 * answer named none — the newest chats, taking one only if it holds the
 * message we sent (a chat the user has open in the browser is never taken).
 */
export async function fromHistory(
  base: string,
  conn: Connection,
  sent: string,
  chatId: string | null,
  signal: AbortSignal,
): Promise<{ chatId: string; reply: string | null; usage: { input: number; output: number } | null } | null> {
  const read = async (id: string) => {
    const messages = historyMessages(await getJson(`${base}/${encodeURIComponent(id)}`, conn, signal));
    if (!messages.some((m) => m.role === "user" && m.text.includes(sentMark(sent)))) return null;
    const reply = replyAfter(messages, sent);
    return { chatId: id, reply: reply?.text ?? null, usage: reply?.usage ?? null };
  };
  if (chatId) return read(chatId);
  const list = await getJson(`${base}?page=1&pageSize=5&sortBy=updatedAt&sortOrder=desc`, conn, signal);
  for (const id of chatIds(list).slice(0, 3)) {
    const found = await read(id).catch(() => null);
    if (found) return found;
  }
  return null;
}

/** How long to wait before reading a history again when the answer was not saved yet. */
export const HISTORY_RETRY_MS = 1_500;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

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
    const token = bareToken(secret(secretName(bot)) ?? "");
    if (!token) return "chat-http brain: no Bearer token — paste it (or the request's cURL) in the bot's settings";
    const expires = tokenExpiry(token);
    if (expires && expires.getTime() <= Date.now()) {
      return `chat-http brain: the Bearer token expired at ${expires.toLocaleString()} — paste a new one (or the request's cURL)`;
    }
    return null;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const bot = input.bot;
    const url = bot.brain.baseUrl!.trim();
    const options = bot.brain.chat ?? {};
    const conn = connectionOf(bareToken(ctx.secret(secretName(bot)) ?? ""), options);
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
    let historyFailed = false;

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
        answer = await ask(url, conn, chatPayload({ content, chatId, model, options }), ctx.signal);
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
      if (answer.error && !answer.text) {
        yield { type: "run.failed", error: `the chat API reported: ${answer.error}` };
        return;
      }
      // The chat's history is the reliable record: the reply that follows the message just sent,
      // with its tokens, and the chat's id when the answer named none (so the chat is continued
      // instead of a new one each time). The streamed text is the fallback.
      const history = historyBase(url, options.historyUrl);
      let found: Awaited<ReturnType<typeof fromHistory>> = null;
      if (history && !historyFailed) {
        const look = () => fromHistory(history, conn, content, answer.chatId ?? chatId, ctx.signal);
        try {
          found = await look();
          // The answer may be saved a moment after the stream ends: look once more.
          if (found && !found.reply) {
            await pause(HISTORY_RETRY_MS, ctx.signal);
            found = (await look()) ?? found;
          }
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          // A server without this history: do not ask it again in this run.
          historyFailed = true;
        }
      }
      if (found) answer.chatId ??= found.chatId;
      const usage = found?.usage ?? (answer.usage.input || answer.usage.output ? answer.usage : null);
      if (usage) yield { type: "run.usage", inputTokens: usage.input, outputTokens: usage.output, cachedTokens: 0, costUsd: 0, subscription: true };
      const reply = (found?.reply ?? answer.text).trim();
      if (answer.chatId && answer.chatId !== chatId) {
        const opened = chatId === null;
        chatId = answer.chatId;
        ctx.sessions.set(chatId);
        // A chat this run opened gets a title, as the browser gives one (in the background).
        if (opened && history && options.titles !== false) void generateTitle(history, chatId, conn, titleMessage(bot.name, input.task));
      }
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
