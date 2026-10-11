// This hub's line to the Orbis cloud (change 0068-cloud-relay, specs/cloud, ADR 0024): once the hub is a device
// of an account, it opens one WebSocket out to its account's Durable Object — no port of the phone is ever
// opened — with the device's token in the upgrade's Authorization header (never in the address). Through it
// the cloud's web app reaches this hub: each relayed request is answered by the hub's own routes (`inject`,
// so the hub's auth checks the account's session again) and each event stream by its own stream route.
import type { FastifyInstance } from "fastify";
import {
  BodyCollector,
  bodyFrames,
  parseFrame,
  relayHeaders,
  RELAY_PING,
  RELAY_PING_MS,
  RELAY_REPLACED,
  RELAY_REVOKED,
  type RelayFrame,
} from "@orbis/shared";

/** The most a relayed request's body may carry (a 25 MB file and its form around it). */
export const RELAY_MAX_BODY = 30 * 1024 * 1024;
/** How long another hub of the account having taken the relay keeps this one quiet. */
export const REPLACED_WAIT_MS = 5 * 60_000;

export interface RelayStatus {
  url: string | null;
  connected: boolean;
  lastError: string | null;
}

/** The parts of a WebSocket this client uses: the platform's own, or a test's. */
interface Socket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "close" | "error" | "message", fn: (e: { data?: unknown; code?: number; reason?: string }) => void): void;
}
type SocketCtor = new (url: string, init: { headers: Record<string, string> }) => Socket;

/** A stream of this hub opened for the cloud (the `ws` socket `injectWS` answers). */
interface LocalStream {
  send(data: string): void;
  close(): void;
  on(event: "message", fn: (data: Buffer) => void): void;
  on(event: "close", fn: () => void): void;
}

export class RelayClient {
  private socket: Socket | null = null;
  private connected = false;
  private lastError: string | null = null;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private quietUntil = 0;
  /** The token the socket opened with: a new one (linked again) opens a new socket. */
  private openedWith: string | null = null;
  private stopped = true;
  private readonly bodies = new Map<string, { head: Extract<RelayFrame, { t: "req" }>; body: BodyCollector }>();
  private readonly streams = new Map<string, LocalStream>();
  /** Streams being opened: the browser's first messages wait for them. */
  private readonly opening = new Map<string, string[]>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly deps: {
      /** The device's token, while this hub is linked and not revoked. */
      token(): string | null;
      /** The cloud's address, or null when the relay is off. */
      url(): string | null;
      WebSocket?: SocketCtor;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  status(): RelayStatus {
    return { url: this.deps.url(), connected: this.connected, lastError: this.lastError };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.pingTimer = setInterval(() => {
      if (this.connected) this.trySend(RELAY_PING);
      this.sync();
    }, RELAY_PING_MS);
    this.pingTimer.unref();
    this.sync();
  }

  stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = this.retryTimer = null;
    this.disconnect();
  }

  /** Open the relay when the hub is linked and the cloud known; close it when either stops being so. */
  sync(): void {
    if (this.stopped) return;
    const token = this.deps.token();
    const url = this.deps.url();
    if (!token || !url) {
      this.disconnect();
      if (!token) this.quietUntil = 0;
      return;
    }
    if (this.socket && this.openedWith === token) return;
    if (this.socket) this.disconnect();
    if (this.retryTimer || this.now() < this.quietUntil) return;
    this.connect(url, token);
  }

  private connect(url: string, token: string): void {
    const Ctor = this.deps.WebSocket ?? (globalThis.WebSocket as unknown as SocketCtor);
    const address = `${url.replace(/^http/, "ws")}/runner`;
    let socket: Socket;
    try {
      socket = new Ctor(address, { headers: { authorization: `Device ${token}` } });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.retry();
      return;
    }
    this.socket = socket;
    this.openedWith = token;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.connected = true;
      this.lastError = null;
      this.attempt = 0;
    });
    socket.addEventListener("message", (e) => {
      if (this.socket !== socket) return;
      const frame = typeof e.data === "string" ? parseFrame(e.data) : null;
      if (frame) void this.handle(frame);
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket && !this.connected) this.lastError = "the Orbis cloud cannot be reached";
    });
    socket.addEventListener("close", (e) => {
      if (this.socket !== socket) return;
      this.dropAll();
      this.socket = null;
      this.openedWith = null;
      this.connected = false;
      if (e.code === RELAY_REVOKED) {
        // The cloud found the device revoked: the device's sync forgets the token; nothing is tried meanwhile.
        this.lastError = "the account revoked this device";
        this.quietUntil = Number.POSITIVE_INFINITY;
        return;
      }
      if (e.code === RELAY_REPLACED) {
        this.lastError = "another hub of this account is connected to the cloud";
        this.quietUntil = this.now() + REPLACED_WAIT_MS;
        return;
      }
      this.lastError ??= "the connection to the Orbis cloud closed";
      this.retry();
    });
  }

  private retry(): void {
    if (this.stopped || this.retryTimer) return;
    this.attempt++;
    const wait = Math.min(60_000, 1_000 * 2 ** Math.min(this.attempt, 6));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.sync();
    }, wait);
    this.retryTimer.unref();
  }

  private disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    this.openedWith = null;
    this.connected = false;
    this.dropAll();
    try {
      socket?.close(1000, "bye");
    } catch {
      /* already closing */
    }
  }

  private dropAll(): void {
    this.bodies.clear();
    this.opening.clear();
    for (const s of this.streams.values()) s.close();
    this.streams.clear();
  }

  private trySend(text: string): void {
    try {
      if (this.socket && this.socket.readyState === 1) this.socket.send(text);
    } catch {
      /* the close event follows */
    }
  }

  private send(frame: RelayFrame): void {
    this.trySend(JSON.stringify(frame));
  }

  private async handle(frame: RelayFrame): Promise<void> {
    switch (frame.t) {
      case "req":
        if (frame.end) return this.answer(frame, new Uint8Array());
        this.bodies.set(frame.id, { head: frame, body: new BodyCollector(RELAY_MAX_BODY) });
        return;
      case "data": {
        const pending = this.bodies.get(frame.id);
        if (!pending) return;
        if (!pending.body.add(frame.data)) {
          this.bodies.delete(frame.id);
          return this.reply(frame.id, 413, { error: { code: "payload_too_large", message: "the request's body is too large" } });
        }
        if (!frame.end) return;
        this.bodies.delete(frame.id);
        return this.answer(pending.head, pending.body.bytes());
      }
      case "open":
        return this.openStream(frame.id, frame.path);
      case "msg":
        this.opening.get(frame.id)?.push(frame.data);
        this.streams.get(frame.id)?.send(frame.data);
        return;
      case "close": {
        this.opening.delete(frame.id);
        const stream = this.streams.get(frame.id);
        this.streams.delete(frame.id);
        stream?.close();
        return;
      }
      default:
        return;
    }
  }

  private reply(id: string, status: number, body: unknown): void {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    this.send({ t: "res", id, status, headers: { "content-type": "application/json; charset=utf-8" }, end: false });
    for (const f of bodyFrames(id, bytes)) this.send(f);
  }

  /** Answer a relayed request with the hub's own routes, as if it had come here. */
  private async answer(head: Extract<RelayFrame, { t: "req" }>, body: Uint8Array): Promise<void> {
    // Only the hub's API crosses the relay: its pages come from the cloud, and its local tools stay local.
    if (!/^\/(api|v1)\//.test(head.path)) return this.reply(head.id, 404, { error: { code: "not_found", message: "not relayed" } });
    let res;
    try {
      res = await this.app.inject({
        method: head.method as "GET",
        url: head.path,
        headers: relayHeaders(Object.entries(head.headers)),
        payload: body.length ? Buffer.from(body) : undefined,
        remoteAddress: head.ip,
      });
    } catch (err) {
      return this.reply(head.id, 502, { error: { code: "hub_failed", message: err instanceof Error ? err.message : String(err) } });
    }
    const headers = relayHeaders(Object.entries(res.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v.join(", ") : String(v)] as [string, string]])));
    const bytes = new Uint8Array(res.rawPayload);
    this.send({ t: "res", id: head.id, status: res.statusCode, headers, end: bytes.length === 0 });
    for (const f of bodyFrames(head.id, bytes)) this.send(f);
  }

  private async openStream(id: string, path: string): Promise<void> {
    if (!/^\/api\/v1\/stream\?/.test(path)) return this.send({ t: "close", id, code: 4404 });
    const waiting: string[] = [];
    this.opening.set(id, waiting);
    let local: LocalStream;
    try {
      local = (await (this.app as unknown as { injectWS(path: string, ctx?: object): Promise<LocalStream> }).injectWS(path, {})) as LocalStream;
    } catch {
      // The hub refused the ticket (used, too old, or never its own).
      this.opening.delete(id);
      return this.send({ t: "close", id, code: 4401 });
    }
    // The cloud's end left (or the relay closed) while it opened.
    if (this.opening.get(id) !== waiting) return local.close();
    this.opening.delete(id);
    this.streams.set(id, local);
    for (const m of waiting) local.send(m);
    local.on("message", (data) => this.send({ t: "msg", id, data: data.toString() }));
    local.on("close", () => {
      if (this.streams.get(id) !== local) return;
      this.streams.delete(id);
      this.send({ t: "close", id });
    });
    this.send({ t: "opened", id });
  }
}
