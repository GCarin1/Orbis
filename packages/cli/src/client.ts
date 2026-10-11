// A small client of the hub API (contracts/hub-surface) over fetch and WebSocket.
import type { ApiErrorBody, StreamEvent } from "@orbis/shared";
import type { Connection } from "./config.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.error.message ?? `HTTP ${status}`);
  }

  describe(): string {
    if (!this.body) return this.message;
    const fields = this.body.error.fields
      ? " (" + Object.entries(this.body.error.fields).map(([k, v]) => `${k}: ${v}`).join("; ") + ")"
      : "";
    return `${this.body.error.message}${fields}`;
  }
}

export class HubClient {
  constructor(private readonly conn: Connection) {}

  get url(): string {
    return this.conn.url;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.conn.url + path, {
        method,
        headers: {
          ...(this.conn.token ? { authorization: `Bearer ${this.conn.token}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new Error(`cannot reach the Orbis hub at ${this.conn.url} — is it running? (orbis serve)`, { cause: err });
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) throw new ApiError(res.status, parsed as ApiErrorBody | null);
    return parsed as T;
  }

  get<T = unknown>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body ?? {});
  }

  put<T = unknown>(path: string, body: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T = unknown>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path);
  }

  /**
   * Open the event stream subscribed to the given conversations; resolves once
   * the hub confirmed the subscription, so no event after it is missed.
   */
  async stream(conversations: string[] | null, onEvent: (event: StreamEvent) => void): Promise<{ close(): void }> {
    // A one-time ticket opens the stream: the token never travels in the address.
    const { ticket } = await this.post<{ ticket: string }>("/api/v1/stream/ticket", {});
    const wsUrl = `${this.conn.url.replace(/^http/, "ws")}/api/v1/stream?ticket=${encodeURIComponent(ticket)}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let ready = false;
      ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", ...(conversations ? { conversations } : {}) }));
      ws.onmessage = (msg) => {
        const event = JSON.parse(String(msg.data)) as StreamEvent | { type: "subscribed" };
        if (event.type === "subscribed") {
          ready = true;
          resolve({ close: () => ws.close() });
          return;
        }
        onEvent(event as StreamEvent);
      };
      ws.onerror = () => {
        if (!ready) reject(new Error(`cannot open the event stream at ${this.conn.url} (check the token)`));
      };
    });
  }
}
