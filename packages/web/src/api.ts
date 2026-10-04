// The web app's client of the hub API (same origin) and its event stream.
import type { ApiErrorBody, StreamEvent } from "@orbis/shared";

const TOKEN_KEY = "orbis.token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    // A refused request names what in it was wrong ("brain.chat.curl: must match pattern …").
    const fields = Object.entries(body?.error.fields ?? {}).map(([field, why]) => `${field}: ${why}`);
    super(`${body?.error.message ?? `HTTP ${status}`}${fields.length ? ` (${fields.join("; ")})` : ""}`);
  }
}

/** Take a token handed over in the URL fragment (#token=...) and remove it from the address bar. */
export function captureTokenFromUrl(): void {
  const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  saveToken(decodeURIComponent(m[1]!));
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Take a pairing code handed over in the URL fragment (#pair=483219: the computer's QR code read by the
 * phone's camera) and remove it from the address bar; the sign-in screen trades it for the token.
 */
export function capturePairingFromUrl(): string | null {
  const m = /(?:^#|&)pair=(\d{6})(?:&|$)/.exec(window.location.hash);
  if (!m) return null;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return m[1]!;
}

/** Trade a pairing code for the hub's token (`POST /api/v1/pairing/claim`, the one route without the token). */
export async function claimPairing(code: string, base = ""): Promise<string> {
  const res = await fetch(`${base}/api/v1/pairing/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = (await res.json().catch(() => null)) as { token?: unknown } | ApiErrorBody | null;
  if (res.ok && body && "token" in body && typeof body.token === "string") return body.token;
  throw new ApiError(res.status, body && "error" in body ? body : null);
}

export function loadToken(): string | null {
  const injected = (window as unknown as { orbisDesktop?: { token?: string } }).orbisDesktop?.token;
  if (injected) return injected;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class Api {
  constructor(
    private readonly token: string,
    private readonly base = "",
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) throw new ApiError(res.status, parsed as ApiErrorBody | null);
    return parsed as T;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  /** A text resource (a YAML template). */
  async text(path: string): Promise<string> {
    const res = await fetch(this.base + path, { headers: { authorization: `Bearer ${this.token}` } });
    const body = await res.text();
    if (!res.ok) {
      let parsed: ApiErrorBody | null = null;
      try {
        parsed = JSON.parse(body) as ApiErrorBody;
      } catch {
        parsed = null;
      }
      throw new ApiError(res.status, parsed);
    }
    return body;
  }

  /** A binary resource (screenshots), or null on 404. */
  async blob(path: string): Promise<Blob | null> {
    const res = await fetch(this.base + path, { headers: { authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, null);
    return res.blob();
  }
  /** Send a recording to the hub's transcription service; resolves with the text. */
  async transcribe(audio: Blob, lang: string): Promise<string> {
    const res = await fetch(`${this.base}/api/v1/voice/transcribe?lang=${encodeURIComponent(lang)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": audio.type || "audio/webm" },
      body: audio,
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as { text?: string } & ApiErrorBody) : null;
    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed?.text ?? "";
  }
  post<T>(path: string, body: unknown = {}) {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, body);
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

/** How often the stream checks the hub still answers, and how long an answer may take. */
export const STREAM_PING_MS = 25_000;
export const STREAM_PONG_MS = 10_000;
/** Back on screen: how long the hub may take to answer before the connection is replaced. */
export const STREAM_WAKE_PONG_MS = 4_000;
/** How long a connection may stay half-open before it is given up and tried again. */
export const STREAM_CONNECT_MS = 10_000;

// WebSocket.readyState values.
const CONNECTING = 0;
const OPEN = 1;

/**
 * The event stream with reconnection: exponential backoff up to 15 s, and
 * `onReconnect` so the app reloads what it may have missed. A connection that
 * stopped answering without closing (a laptop that slept, a dropped Wi-Fi) is
 * found by a ping and replaced, so the app never shows "connected" while
 * missing events. Back on screen (a phone app reopened) or back online, the
 * stream does not wait out its backoff: a closed connection is opened again
 * at once and an open one must answer within STREAM_WAKE_PONG_MS.
 */
export function openStream(
  token: string,
  handlers: { onEvent(e: StreamEvent): void; onStatus(connected: boolean): void; onReconnect(): void },
): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  const check = (within = STREAM_PONG_MS) => {
    if (!ws || ws.readyState !== OPEN || pongTimer) return;
    try {
      ws.send(JSON.stringify({ type: "ping" }));
    } catch {
      /* closing already */
    }
    const current = ws;
    pongTimer = setTimeout(() => {
      pongTimer = null;
      current.close();
    }, within);
  };
  const onWake = () => {
    if (stopped || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    if (!ws || ws.readyState > OPEN) {
      // Closed and waiting out the backoff: try now.
      if (timer) clearTimeout(timer);
      timer = null;
      connect();
      return;
    }
    if (ws.readyState === OPEN) {
      // An answer already awaited may be on a dead connection: ask again, with the shorter wait.
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = null;
      check(STREAM_WAKE_PONG_MS);
    }
  };

  const connect = () => {
    if (connectTimer) clearTimeout(connectTimer);
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const current = new WebSocket(`${proto}://${window.location.host}/api/v1/stream?token=${encodeURIComponent(token)}`);
    ws = current;
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (current.readyState === CONNECTING) current.close();
    }, STREAM_CONNECT_MS);
    current.onopen = () => {
      if (ws !== current) return;
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
      current.send(JSON.stringify({ type: "subscribe" }));
      handlers.onStatus(true);
      if (attempt > 0) handlers.onReconnect();
      attempt = 0;
    };
    current.onmessage = (msg) => {
      if (ws !== current) return;
      // Anything from the hub proves the connection lives.
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = null;
      let event: StreamEvent;
      try {
        event = JSON.parse(String(msg.data)) as StreamEvent;
      } catch {
        return;
      }
      if (event.type === "pong" || (event.type as string) === "subscribed") return;
      handlers.onEvent(event);
    };
    current.onclose = () => {
      // A connection already replaced says nothing about the new one.
      if (ws !== current) return;
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = null;
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
      handlers.onStatus(false);
      if (stopped) return;
      attempt++;
      timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)));
    };
  };
  connect();
  pingTimer = setInterval(check, STREAM_PING_MS);
  globalThis.addEventListener?.("online", onWake);
  globalThis.addEventListener?.("focus", onWake);
  globalThis.document?.addEventListener?.("visibilitychange", onWake);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (connectTimer) clearTimeout(connectTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (pongTimer) clearTimeout(pongTimer);
    globalThis.removeEventListener?.("online", onWake);
    globalThis.removeEventListener?.("focus", onWake);
    globalThis.document?.removeEventListener?.("visibilitychange", onWake);
    ws?.close();
  };
}
