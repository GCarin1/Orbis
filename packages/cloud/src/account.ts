// One account's Durable Object (change 0068-cloud-relay, specs/cloud, ADR 0024): it holds the WebSocket its
// hub opened out to the cloud, and the event streams of the account's open browsers, with the hibernation
// API (an idle relay costs nothing). A relayed request becomes frames to the hub and its answer frames back;
// a stream's messages cross both ways under its own id. With no hub connected, the app hears that the phone
// is off (503 runner_offline).
import {
  BodyCollector,
  bodyFrames,
  parseFrame,
  relayHeaders,
  RELAY_PING,
  RELAY_PONG,
  RELAY_REPLACED,
  type RelayFrame,
} from "@orbis/shared";
import { errorJson } from "./security.js";

/** How long a relayed request may wait for the hub's answer. */
export const ANSWER_MS = 100_000;
/** The most an answer may carry (a 25 MB file and room around it). */
export const MAX_ANSWER = 30 * 1024 * 1024;
/** A relay this old opens again, so its device token is checked again (a revoked device drops off). */
export const RELAY_RENEW_MS = 60 * 60_000;
/** Requests one account may relay in a minute. */
export const ACCOUNT_REQUESTS_PER_MINUTE = 600;

/** The parts of the platform's WebSocket this object uses. */
export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface State {
  acceptWebSocket(ws: Socket, tags?: string[]): void;
  getWebSockets(tag?: string): Socket[];
  getTags(ws: Socket): string[];
  setWebSocketAutoResponse(pair?: unknown): void;
  storage: { setAlarm(at: number): Promise<void> | void; getAlarm(): Promise<number | null> | number | null };
}

/** The platform's pieces the object needs, replaceable in tests. */
export interface Platform {
  pair(): { client: unknown; server: Socket };
  upgrade(client: unknown): Response;
  autoResponse(request: string, response: string): unknown;
  now(): number;
  id(): string;
}

const cloudflare: Platform = {
  pair() {
    const p = new (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, Socket> }).WebSocketPair();
    return { client: p[0], server: p[1] };
  },
  upgrade: (client) => new Response(null, { status: 101, webSocket: client } as ResponseInit),
  autoResponse: (a, b) => new (globalThis as unknown as { WebSocketRequestResponsePair: new (a: string, b: string) => unknown }).WebSocketRequestResponsePair(a, b),
  now: () => Date.now(),
  id: () => crypto.randomUUID().replace(/-/g, ""),
};

interface Pending {
  resolve(res: Response): void;
  timer: ReturnType<typeof setTimeout>;
  head: Extract<RelayFrame, { t: "res" }> | null;
  body: BodyCollector;
}

export class Account {
  private readonly pending = new Map<string, Pending>();
  private window = { start: 0, count: 0 };
  private readonly platform: Platform;

  constructor(
    private readonly state: State,
    _env: unknown,
    platform?: Platform,
  ) {
    this.platform = platform ?? cloudflare;
    // The hub's ping is answered without waking the object.
    this.state.setWebSocketAutoResponse(this.platform.autoResponse(RELAY_PING, RELAY_PONG));
  }

  private runner(): Socket | null {
    return this.state.getWebSockets("runner").at(-1) ?? null;
  }

  async fetch(req: Request): Promise<Response> {
    const kind = req.headers.get("x-orbis-kind");
    const path = req.headers.get("x-orbis-path") ?? "/";
    if (kind === "runner") return this.acceptRunner(req);
    const runner = this.runner();
    if (!runner) return errorJson(503, "runner_offline", "your phone is off or offline: your bots answer when it is back");
    if (kind === "stream") return this.openStream(runner, path);
    if (!this.allow()) return errorJson(429, "too_many_requests", "too many requests for this account: wait a minute");
    return this.relay(runner, req, path);
  }

  private allow(): boolean {
    const at = this.platform.now();
    if (at - this.window.start >= 60_000) this.window = { start: at, count: 0 };
    return ++this.window.count <= ACCOUNT_REQUESTS_PER_MINUTE;
  }

  private async acceptRunner(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorJson(426, "upgrade_required", "the relay is a WebSocket");
    // One hub relays for the account: the newest, and the one it replaces is told so (it waits before trying again).
    for (const old of this.state.getWebSockets("runner")) {
      try {
        old.close(RELAY_REPLACED, "another hub of this account connected");
      } catch {
        /* gone already */
      }
    }
    this.closeStreams(1012, "the hub changed");
    const { client, server } = this.platform.pair();
    this.state.acceptWebSocket(server, ["runner"]);
    server.serializeAttachment({ device: req.headers.get("x-orbis-device"), at: this.platform.now() });
    const alarm = await this.state.storage.getAlarm();
    if (alarm === null) await this.state.storage.setAlarm(this.platform.now() + RELAY_RENEW_MS);
    return this.platform.upgrade(client);
  }

  private openStream(runner: Socket, path: string): Response {
    const id = this.platform.id();
    const { client, server } = this.platform.pair();
    this.state.acceptWebSocket(server, ["browser", `s:${id}`]);
    this.send(runner, { t: "open", id, path });
    return this.platform.upgrade(client);
  }

  private relay(runner: Socket, req: Request, path: string): Promise<Response> {
    const id = this.platform.id();
    return new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(errorJson(504, "hub_timeout", "your phone took too long to answer"));
      }, ANSWER_MS);
      this.pending.set(id, { resolve, timer, head: null, body: new BodyCollector(MAX_ANSWER) });
      void (async () => {
        const body = req.method === "GET" || req.method === "HEAD" ? new Uint8Array() : new Uint8Array(await req.arrayBuffer());
        const headers = relayHeaders(req.headers);
        const ip = headers["x-orbis-ip"] ?? req.headers.get("x-orbis-ip") ?? undefined;
        this.send(runner, { t: "req", id, method: req.method, path, headers, end: body.length === 0, ...(ip ? { ip } : {}) });
        for (const f of bodyFrames(id, body)) this.send(runner, f);
      })().catch(() => this.finish(id, errorJson(502, "relay_failed", "the request could not reach your phone")));
    });
  }

  private finish(id: string, res: Response): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(res);
  }

  private send(ws: Socket, frame: RelayFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* the close handler follows */
    }
  }

  private browser(id: string): Socket | null {
    return this.state.getWebSockets(`s:${id}`)[0] ?? null;
  }

  private streamId(ws: Socket): string | null {
    const tag = this.state.getTags(ws).find((t) => t.startsWith("s:"));
    return tag ? tag.slice(2) : null;
  }

  async webSocketMessage(ws: Socket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const tags = this.state.getTags(ws);
    if (!tags.includes("runner")) {
      // A browser's message goes to the hub, under its stream's id.
      const id = this.streamId(ws);
      const runner = this.runner();
      if (id && runner && text.length <= 64 * 1024) this.send(runner, { t: "msg", id, data: text });
      return;
    }
    if (ws !== this.runner()) return;
    const frame = parseFrame(text);
    if (!frame) return;
    switch (frame.t) {
      case "res": {
        const p = this.pending.get(frame.id);
        if (!p) return;
        p.head = frame;
        if (frame.end) this.finish(frame.id, this.answer(frame, new Uint8Array()));
        return;
      }
      case "data": {
        const p = this.pending.get(frame.id);
        if (!p || !p.head) return;
        if (!p.body.add(frame.data)) return this.finish(frame.id, errorJson(502, "answer_too_large", "your phone's answer is too large"));
        if (frame.end) this.finish(frame.id, this.answer(p.head, p.body.bytes()));
        return;
      }
      case "msg":
        this.browser(frame.id)?.send(frame.data);
        return;
      case "close": {
        const b = this.browser(frame.id);
        // A ticket the hub refused closes the browser's stream as refused; it asks a new one.
        try {
          b?.close(frame.code === 4401 ? 4401 : 1000, frame.code === 4401 ? "refused" : "closed");
        } catch {
          /* gone */
        }
        return;
      }
      default:
        return;
    }
  }

  private answer(head: Extract<RelayFrame, { t: "res" }>, body: Uint8Array): Response {
    const status = head.status >= 200 && head.status <= 599 ? head.status : 502;
    const empty = status === 204 || status === 304;
    return new Response(empty ? null : (body as Uint8Array<ArrayBuffer>), { status, headers: relayHeaders(Object.entries(head.headers)) });
  }

  async webSocketClose(ws: Socket, code: number): Promise<void> {
    const tags = this.state.getTags(ws);
    if (tags.includes("runner")) {
      // Was it the relay in use? (one replaced already left)
      if (this.state.getWebSockets("runner").filter((s) => s !== ws).length) return;
      for (const id of [...this.pending.keys()]) this.finish(id, errorJson(503, "runner_offline", "your phone went offline: your bots answer when it is back"));
      this.closeStreams(1012, "your phone went offline");
      return;
    }
    const id = this.streamId(ws);
    const runner = this.runner();
    if (id && runner) this.send(runner, { t: "close", id, code });
  }

  async webSocketError(ws: Socket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  private closeStreams(code: number, reason: string): void {
    for (const b of this.state.getWebSockets("browser")) {
      try {
        b.close(code, reason);
      } catch {
        /* gone */
      }
    }
  }

  /** Relays open long enough open again, so their device token is checked again. */
  async alarm(): Promise<void> {
    const at = this.platform.now();
    let next = Number.POSITIVE_INFINITY;
    for (const ws of this.state.getWebSockets("runner")) {
      const opened = (ws.deserializeAttachment() as { at?: number } | null)?.at ?? 0;
      if (at - opened >= RELAY_RENEW_MS) {
        try {
          ws.close(1012, "renew");
        } catch {
          /* gone */
        }
      } else next = Math.min(next, opened + RELAY_RENEW_MS);
    }
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
  }
}
