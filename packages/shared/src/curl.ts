// Reading a "Copy as cURL" command (specs/agent-runtimes: chat-http brain): the
// address, the Bearer token and the chat settings of a request a browser made,
// so the user pastes one command instead of copying each value by hand.
import { CHAT_HTTP_HEADER_NAMES } from "./types.js";

/** What a cURL command says about a chat request. */
export interface ParsedCurl {
  url: string | null;
  /** The request sends a body (a message); a GET without one only reads. */
  hasBody: boolean;
  /** For a request to a chats' history (`…/history/chats[/<id>]`): that history's address. */
  historyUrl: string | null;
  /** The Bearer token, without the word "Bearer". */
  token: string | null;
  /** Every header, names in lowercase. */
  headers: Record<string, string>;
  /** The JSON the request sends (the `data` field of a multipart body, or the body itself). */
  json: unknown;
  agentId: string | null;
  agentVersion: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
}

/**
 * Split a shell command into words: 'single', $'ANSI-C' (\r \n \t \\ \' \"),
 * "double" quotes, backslash-newline continuations (bash) and the caret
 * escapes of Windows' "Copy as cURL (cmd)".
 */
export function shellWords(command: string): string[] {
  let text = command.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ");
  // Windows' cmd format quotes with ^"…^" (and escapes inner quotes as \^"): those are plain quotes.
  if (/\^"/.test(text)) text = text.replace(/\^"/g, '"');
  const words: string[] = [];
  let word = "";
  let inWord = false;
  const push = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (/\s/.test(c)) {
      push();
      continue;
    }
    inWord = true;
    if (c === "$" && text[i + 1] === "'") {
      i += 2;
      for (; i < text.length && text[i] !== "'"; i++) {
        if (text[i] === "\\" && i + 1 < text.length) {
          const next = text[++i]!;
          word += next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next;
        } else word += text[i];
      }
    } else if (c === "'") {
      for (i++; i < text.length && text[i] !== "'"; i++) word += text[i];
    } else if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\" && i + 1 < text.length && '"\\$`'.includes(text[i + 1]!)) word += text[++i];
        else if (text[i] === "^" && i + 1 < text.length) word += text[++i];
        else word += text[i];
      }
    } else if (c === "^" && i + 1 < text.length) {
      word += text[++i];
    } else if (c === "\\" && i + 1 < text.length) {
      word += text[++i];
    } else word += c;
  }
  push();
  return words;
}

/** The JSON of a multipart body's `data` field, or of a plain JSON body. */
function bodyJson(body: string | null): unknown {
  if (!body) return null;
  const part = /name="data"\r?\n\r?\n([\s\S]*?)\r?\n--/.exec(body);
  const raw = part ? part[1]! : body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read a cURL command; values it does not hold are null. */
export function parseCurl(command: string): ParsedCurl {
  const words = shellWords(command.trim());
  let url: string | null = null;
  let body: string | null = null;
  const headers: Record<string, string> = {};
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w === "--url") url = words[++i] ?? null;
    else if (w === "-H" || w === "--header") {
      const h = words[++i] ?? "";
      const at = h.indexOf(":");
      if (at > 0) headers[h.slice(0, at).trim().toLowerCase()] = h.slice(at + 1).trim();
    } else if (w === "--data-raw" || w === "--data" || w === "--data-binary" || w === "-d") body = words[++i] ?? null;
    else if (!url && /^https?:\/\//i.test(w)) url = w;
  }
  const auth = headers.authorization ?? "";
  const token = /^Bearer\s+\S/i.test(auth) ? cleanBearer(auth) || null : null;
  const json = bodyJson(body);
  const j = (json ?? {}) as { agent?: { agentId?: unknown; version?: unknown }; config?: { modelId?: unknown; temperature?: unknown; maxTokens?: unknown } };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const at = url ? url.search(/\/history\/chats(?=[/?#]|$)/) : -1;
  return {
    url,
    hasBody: body !== null,
    historyUrl: url && at >= 0 ? url.slice(0, at + "/history/chats".length) : null,
    token,
    headers,
    json,
    agentId: str(j.agent?.agentId),
    agentVersion: str(j.agent?.version),
    model: str(j.config?.modelId),
    temperature: num(j.config?.temperature),
    maxTokens: num(j.config?.maxTokens),
  };
}

/**
 * The token as a person may paste it: bare, after "Bearer ", as a whole
 * `Authorization: Bearer …` line, in quotes, or wrapped over several lines.
 * A token is one word, so spaces and line breaks inside it are dropped.
 */
export function cleanBearer(raw: string): string {
  const text = raw
    .trim()
    // `-H 'authorization: …` or `"Authorization: …`, as a cURL line or a copied header shows it.
    .replace(/^(?:(?:-H|--header)\s+)?["'`]*\s*(?:authorization\s*:\s*)?/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^["'`]+/, "");
  // A token is one word: spaces and line breaks of a wrapped paste, and a closing quote or line continuation, are not part of it.
  return text.replace(/\s+/g, "").replace(/["'`\\^]+$/g, "");
}

/** The headers of a cURL that a server may check besides the token: Referer, User-Agent, Accept-Language. */
export function browserHeaders(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of CHAT_HTTP_HEADER_NAMES) {
    const value = headers[name]?.trim();
    if (value) kept[name] = value;
  }
  return kept;
}

/**
 * When a JWT Bearer token expires (its `exp`), or null when the token is not a
 * JWT or names no expiry. The signature is not checked: this is only a hint.
 */
export function tokenExpiry(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const text = typeof atob === "function" ? atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")) : "";
    const exp = (JSON.parse(text) as { exp?: unknown }).exp;
    return typeof exp === "number" ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}
