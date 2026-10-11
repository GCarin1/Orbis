// The relay between the Orbis cloud and a phone's hub (change 0068-cloud-relay, specs/cloud, ADR 0024): the
// frames both ends exchange over the one WebSocket the hub opens to its account's Durable Object. The hub
// answers each relayed request as if it came to it directly; bodies travel in pieces small enough for a
// WebSocket message of the cloud (1 MiB), and event streams ride the same socket, each with its own id.

/** The largest piece of a body one frame carries (before base64). */
export const RELAY_CHUNK_BYTES = 512 * 1024;
/** The hub says it lives this often; the cloud answers without waking up. */
export const RELAY_PING_MS = 30_000;
/** The text of the hub's ping and of the cloud's automatic answer. */
export const RELAY_PING = '{"t":"ping"}';
export const RELAY_PONG = '{"t":"pong"}';
/** Close codes: another of the account's hubs took the relay; the account revoked the device. */
export const RELAY_REPLACED = 4409;
export const RELAY_REVOKED = 4401;

export type RelayFrame =
  /** cloud → hub: a request to answer (its body follows in `data` frames unless `end`). */
  | { t: "req"; id: string; method: string; path: string; headers: Record<string, string>; end: boolean; ip?: string }
  /** hub → cloud: the answer's head (its body follows in `data` frames unless `end`). */
  | { t: "res"; id: string; status: number; headers: Record<string, string>; end: boolean }
  /** Either way: a piece of the body of request or answer `id`, base64. */
  | { t: "data"; id: string; data: string; end: boolean }
  /** cloud → hub: open the event stream at `path` (it carries its one-time ticket) for stream `id`. */
  | { t: "open"; id: string; path: string }
  /** hub → cloud: stream `id` is open. */
  | { t: "opened"; id: string }
  /** Either way: a text message of stream `id`. */
  | { t: "msg"; id: string; data: string }
  /** Either way: stream `id` is over (refused, or one end left). */
  | { t: "close"; id: string; code?: number }
  | { t: "ping" }
  | { t: "pong" };

const TYPES = new Set(["req", "res", "data", "open", "opened", "msg", "close", "ping", "pong"]);

/** A frame read from the socket, or null when it is not one (never trusted further than its shape). */
export function parseFrame(raw: string): RelayFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const f = value as Record<string, unknown>;
  if (typeof f.t !== "string" || !TYPES.has(f.t)) return null;
  if (f.t !== "ping" && f.t !== "pong" && (typeof f.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(f.id))) return null;
  return value as RelayFrame;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** The `data` frames that carry `body` for `id` (none for an empty body: the head said `end`). */
export function bodyFrames(id: string, body: Uint8Array): RelayFrame[] {
  const frames: RelayFrame[] = [];
  for (let at = 0; at < body.length; at += RELAY_CHUNK_BYTES) {
    const piece = body.subarray(at, at + RELAY_CHUNK_BYTES);
    frames.push({ t: "data", id, data: toBase64(piece), end: at + RELAY_CHUNK_BYTES >= body.length });
  }
  return frames;
}

/** Collects the pieces of one body, refusing more than `limit` bytes. */
export class BodyCollector {
  private readonly parts: Uint8Array[] = [];
  private size = 0;
  constructor(private readonly limit: number) {}

  add(b64: string): boolean {
    const piece = fromBase64(b64);
    this.size += piece.length;
    if (this.size > this.limit) return false;
    this.parts.push(piece);
    return true;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/** Headers that belong to one hop and never cross the relay. */
const HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "te",
  "trailer",
]);

/** The headers worth relaying: no hop-by-hop ones, no cookies, none of the cloud's own (`cf-*`, `x-orbis-*`). */
export function relayHeaders(headers: Iterable<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers) {
    const key = k.toLowerCase();
    if (HOP.has(key) || key.startsWith("cf-") || key.startsWith("x-orbis-") || key.startsWith("sec-websocket")) continue;
    out[key] = v;
  }
  return out;
}
