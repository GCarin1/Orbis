// The web app's client of the hub API (same origin) and its event stream.
import type { ApiErrorBody, StreamEvent } from "@orbis/shared";

const TOKEN_KEY = "orbis.token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.error.message ?? `HTTP ${status}`);
  }
}

/** Take a token handed over in the URL fragment (#token=...) and remove it from the address bar. */
export function captureTokenFromUrl(): void {
  const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  saveToken(decodeURIComponent(m[1]!));
  history.replaceState(null, "", window.location.pathname + window.location.search);
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
  /** A binary resource (screenshots), or null on 404. */
  async blob(path: string): Promise<Blob | null> {
    const res = await fetch(this.base + path, { headers: { authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, null);
    return res.blob();
  }
  post<T>(path: string, body: unknown = {}) {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

/**
 * The event stream with reconnection: exponential backoff up to 15 s, and
 * `onReconnect` so the app reloads what it may have missed.
 */
export function openStream(
  token: string,
  handlers: { onEvent(e: StreamEvent): void; onStatus(connected: boolean): void; onReconnect(): void },
): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${window.location.host}/api/v1/stream?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      ws!.send(JSON.stringify({ type: "subscribe" }));
      handlers.onStatus(true);
      if (attempt > 0) handlers.onReconnect();
      attempt = 0;
    };
    ws.onmessage = (msg) => {
      const event = JSON.parse(String(msg.data)) as StreamEvent;
      handlers.onEvent(event);
    };
    ws.onclose = () => {
      handlers.onStatus(false);
      if (stopped) return;
      attempt++;
      timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)));
    };
  };
  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
