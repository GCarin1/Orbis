// The hub as an MCP *client* (specs/tool-gateway): it connects to external MCP
// servers — a program it starts (stdio, one JSON-RPC message per line) or a
// streamable HTTP endpoint (JSON or server-sent events, with a session id) —
// lists their tools and calls them for the bots.
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { ORBIS_VERSION } from "@orbis/shared";
import { MCP_PROTOCOL_VERSION } from "./protocol.js";

export const CONNECT_TIMEOUT_MS = 120_000;
export const CALL_TIMEOUT_MS = 300_000;
const STDERR_TAIL = 4_000;

export interface McpRemoteTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
}

export interface McpCallResult {
  text: string;
  isError: boolean;
}

/** The server asks for credentials (HTTP 401): `wwwAuthenticate` carries where to sign in. */
export class McpAuthError extends Error {
  constructor(public readonly wwwAuthenticate: string | null) {
    super("the server asks for authorization");
  }
}

export class McpError extends Error {}

/** A message the server sends on its own: a log line, a resource that changed, a new list of tools. */
export interface McpNotification {
  method: string;
  params: Record<string, unknown>;
}

export type NotificationHandler = (notification: McpNotification) => void;

export interface McpTransport {
  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
  /** Where the notifications the server sends on its own go. */
  onNotification?(handler: NotificationHandler): void;
  /** Called once when the connection ends by itself (the program stopped), not on close(). */
  onClose?(handler: (why: string) => void): void;
  /** Keep a stream open for what the server sends between requests (streamable HTTP's GET). */
  listen?(): void;
}

/** What a server's request to the client gets: `ping` is answered, anything else is not offered. */
function answerFor(msg: RpcMessage): object {
  return msg.method === "ping"
    ? { jsonrpc: "2.0", id: msg.id, result: {} }
    : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Orbis does not support ${msg.method}` } };
}

/** A message with a method and no id: a notification. */
function asNotification(msg: RpcMessage): McpNotification | null {
  if (!msg.method || (msg.id !== undefined && msg.id !== null)) return null;
  return { method: msg.method, params: (msg.params ?? {}) as Record<string, unknown> };
}

type Pending = { resolve(value: unknown): void; reject(err: Error): void; timer: NodeJS.Timeout };

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function settle(pending: Map<number, Pending>, msg: RpcMessage): void {
  if (typeof msg.id !== "number") return;
  const waiter = pending.get(msg.id);
  if (!waiter) return;
  pending.delete(msg.id);
  clearTimeout(waiter.timer);
  if (msg.error) waiter.reject(new McpError(`${msg.error.message} (${msg.error.code})`));
  else waiter.resolve(msg.result);
}

/**
 * What a crashed server said: its error line (Node prints the stack and then
 * "Node.js vXX" last, which tells nothing), else its last lines.
 */
export function stderrSummary(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const error = lines.find((l) => /\b(error|cannot|not found|ENOENT|EACCES|failed)\b/i.test(l) && !/^at\s/.test(l));
  const text =
    error ??
    lines
      .filter((l) => !/^Node\.js v\d/.test(l) && !/^[{}]$/.test(l))
      .slice(-3)
      .join(" ");
  return text.slice(0, 400);
}

/** A server the hub starts: messages are newline-delimited JSON on its stdin and stdout. */
export class StdioTransport implements McpTransport {
  private readonly child: ChildProcess;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private stderr = "";
  private exited: string | null = null;
  private closing = false;
  private notified: NotificationHandler | null = null;
  private closed: ((why: string) => void) | null = null;

  constructor(command: string, args: string[], env: Record<string, string>, cwd?: string) {
    this.child = spawn(command, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    createInterface({ input: this.child.stdout! }).on("line", (line) => {
      const text = line.trim();
      if (!text.startsWith("{")) return;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(text) as RpcMessage;
      } catch {
        return;
      }
      if (msg.method && msg.id !== undefined && msg.id !== null) {
        // A request from the server: a ping is answered; sampling, roots… Orbis offers none of these.
        this.write(answerFor(msg));
        return;
      }
      const notification = asNotification(msg);
      if (notification) {
        this.notified?.(notification);
        return;
      }
      settle(this.pending, msg);
    });
    this.child.stderr!.on("data", (d: Buffer) => {
      this.stderr = (this.stderr + d.toString("utf8")).slice(-STDERR_TAIL);
    });
    const fail = (why: string) => {
      const first = this.exited === null;
      this.exited = why;
      if (first && !this.closing) {
        const detail = stderrSummary(this.stderr);
        this.closed?.(`${why}${detail ? `: ${detail}` : ""}`);
      }
      for (const [id, waiter] of this.pending) {
        clearTimeout(waiter.timer);
        const detail = stderrSummary(this.stderr);
        waiter.reject(new McpError(`${why}${detail ? `: ${detail}` : ""}`));
        this.pending.delete(id);
      }
    };
    this.child.on("error", (err) => fail(`could not start ${command}: ${err.message}`));
    this.child.on("exit", (code, signal) => fail(`the server stopped (${signal ?? `exit code ${code}`})`));
  }

  private write(msg: object): void {
    this.child.stdin?.write(`${JSON.stringify(msg)}\n`);
  }

  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (this.exited) return Promise.reject(new McpError(this.exited));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpError(`${method} took longer than ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (!this.exited) this.write({ jsonrpc: "2.0", method, params });
  }

  onNotification(handler: NotificationHandler): void {
    this.notified = handler;
  }

  onClose(handler: (why: string) => void): void {
    this.closed = handler;
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.exited) return;
    this.child.stdin?.end();
    const gone = new Promise<void>((r) => this.child.once("exit", () => r()));
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
    this.child.kill("SIGTERM");
    await gone;
    clearTimeout(timer);
  }
}

/**
 * Read a server-sent event stream: each JSON-RPC message goes to `onMessage`, which returns true to stop
 * reading (the answer it waited for came).
 */
async function readEvents(res: Response, onMessage: (msg: RpcMessage) => boolean | void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(data) as RpcMessage;
      } catch {
        continue; // not JSON: skip
      }
      if (onMessage(msg) === true) {
        await reader.cancel().catch(() => undefined);
        return;
      }
    }
    if (done) return;
  }
}

/** The JSON-RPC answer inside a server-sent event stream; what else the server sends on the way is handed on. */
async function readEventStream(res: Response, id: number, onOther: (msg: RpcMessage) => void = () => undefined): Promise<RpcMessage | null> {
  let answer: RpcMessage | null = null;
  await readEvents(res, (msg) => {
    if (msg.id === id && !msg.method) {
      answer = msg;
      return true;
    }
    onOther(msg);
    return false;
  });
  return answer;
}

/** How long the hub waits before opening again a stream the server closed: doubling, up to a minute. */
export const LISTEN_RETRY_MS = [1_000, 2_000, 5_000, 15_000, 30_000, 60_000];

/** A streamable HTTP server: each message is a POST; the answer is JSON or an event stream. */
export class HttpTransport implements McpTransport {
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private nextId = 1;
  private notified: NotificationHandler | null = null;
  private closed: ((why: string) => void) | null = null;
  private listening: AbortController | null = null;

  constructor(
    private readonly url: string,
    /** Extra headers for every request, read each time (a refreshed token). */
    private readonly headers: () => Promise<Record<string, string>> = async () => ({}),
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    /** The address errors quote: without a key the address carries (`?apikey=…`). */
    private readonly shown: string = url,
  ) {}

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }

  private async post(body: object, timeoutMs: number): Promise<Response> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...(this.protocolVersion ? { "mcp-protocol-version": this.protocolVersion } : {}),
        ...(await this.headers()),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) throw new McpAuthError(res.headers.get("www-authenticate"));
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    return res;
  }

  async request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    let res: Response;
    try {
      res = await this.post({ jsonrpc: "2.0", id, method, params }, timeoutMs);
    } catch (err) {
      if (err instanceof McpAuthError) throw err;
      throw new McpError(`${this.shown} did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw new McpError(`${this.shown} answered ${res.status}${text ? `: ${text}` : ""}`);
    }
    const type = res.headers.get("content-type") ?? "";
    const msg = type.includes("text/event-stream") ? await readEventStream(res, id, (other) => this.fromServer(other)) : ((await res.json()) as RpcMessage);
    if (!msg) throw new McpError(`${this.shown} closed the stream without answering ${method}`);
    if (msg.error) throw new McpError(`${msg.error.message} (${msg.error.code})`);
    return msg.result;
  }

  async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    const res = await this.post({ jsonrpc: "2.0", method, params }, 30_000);
    await res.body?.cancel().catch(() => undefined);
  }

  onNotification(handler: NotificationHandler): void {
    this.notified = handler;
  }

  onClose(handler: (why: string) => void): void {
    this.closed = handler;
  }

  /** A message the server sent on its own: a notification goes on, a request (a ping) is answered. */
  private fromServer(msg: RpcMessage): void {
    const notification = asNotification(msg);
    if (notification) {
      this.notified?.(notification);
      return;
    }
    if (msg.method && msg.id !== undefined && msg.id !== null) {
      void this.post(answerFor(msg), 30_000)
        .then((res) => res.body?.cancel())
        .catch(() => undefined);
    }
  }

  /**
   * Keep the server's GET stream open for what it sends between requests, opening it again when it ends.
   * A server that offers none (405) is left alone; one that asks to sign in again ends the listening.
   */
  listen(): void {
    if (this.listening) return;
    const controller = new AbortController();
    this.listening = controller;
    void (async () => {
      let attempt = 0;
      while (!controller.signal.aborted) {
        let res: Response;
        try {
          res = await this.fetchImpl(this.url, {
            method: "GET",
            headers: {
              accept: "text/event-stream",
              ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
              ...(this.protocolVersion ? { "mcp-protocol-version": this.protocolVersion } : {}),
              ...(await this.headers()),
            },
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) return;
          await this.pause(attempt++, controller.signal);
          continue;
        }
        if (res.status === 405 || res.status === 404 || res.status === 400) {
          await res.body?.cancel().catch(() => undefined);
          this.listening = null;
          return;
        }
        if (res.status === 401) {
          await res.body?.cancel().catch(() => undefined);
          this.listening = null;
          this.closed?.("the server asks to sign in again");
          return;
        }
        if (res.ok && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
          attempt = 0;
          await readEvents(res, (msg) => void this.fromServer(msg)).catch(() => undefined);
        } else {
          await res.body?.cancel().catch(() => undefined);
        }
        if (controller.signal.aborted) return;
        await this.pause(attempt++, controller.signal);
      }
    })();
  }

  private pause(attempt: number, signal: AbortSignal): Promise<void> {
    const ms = LISTEN_RETRY_MS[Math.min(attempt, LISTEN_RETRY_MS.length - 1)]!;
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  async close(): Promise<void> {
    this.listening?.abort();
    this.listening = null;
    if (!this.sessionId) return;
    await this.fetchImpl(this.url, {
      method: "DELETE",
      headers: { "mcp-session-id": this.sessionId, ...(await this.headers()) },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  }
}

/** Flatten a `tools/call` result into the text a brain reads. */
export function resultText(result: unknown): McpCallResult {
  const r = (result ?? {}) as { content?: Array<Record<string, unknown>>; structuredContent?: unknown; isError?: boolean };
  const parts: string[] = [];
  for (const item of r.content ?? []) {
    if (item.type === "text") parts.push(String(item.text ?? ""));
    else if (item.type === "image" || item.type === "audio") parts.push(`[${item.type}: ${String(item.mimeType ?? "")}]`);
    else if (item.type === "resource") {
      const resource = (item.resource ?? {}) as { uri?: string; text?: string };
      parts.push(resource.text ?? `[resource: ${resource.uri ?? ""}]`);
    } else if (item.type === "resource_link") parts.push(`[link: ${String(item.uri ?? "")}]`);
  }
  if (parts.length === 0 && r.structuredContent !== undefined) parts.push(JSON.stringify(r.structuredContent));
  return { text: parts.join("\n"), isError: r.isError === true };
}

/** What a server says it can do, from its `initialize` answer. */
export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name?: string;
  mimeType?: string;
}

export class McpClient {
  /** What the server said it can do when it connected. */
  capabilities: McpServerCapabilities = {};

  constructor(private readonly transport: McpTransport) {}

  /** `initialize`, then `notifications/initialized`; resolves with the server's name. */
  async connect(timeoutMs = CONNECT_TIMEOUT_MS): Promise<{ name: string; version: string; instructions: string | null }> {
    const result = (await this.transport.request(
      "initialize",
      { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "orbis", version: ORBIS_VERSION } },
      timeoutMs,
    )) as { protocolVersion?: string; serverInfo?: { name?: string; version?: string }; instructions?: string; capabilities?: McpServerCapabilities };
    if (this.transport instanceof HttpTransport) this.transport.setProtocolVersion(result.protocolVersion ?? MCP_PROTOCOL_VERSION);
    this.capabilities = result.capabilities ?? {};
    await this.transport.notify("notifications/initialized");
    return { name: result.serverInfo?.name ?? "?", version: result.serverInfo?.version ?? "?", instructions: result.instructions ?? null };
  }

  /** Where the notifications the server sends on its own go. */
  onNotification(handler: NotificationHandler): void {
    this.transport.onNotification?.(handler);
  }

  /** Called once when the connection ends by itself. */
  onClose(handler: (why: string) => void): void {
    this.transport.onClose?.(handler);
  }

  /** Keep listening for what the server sends between requests (a no-op for a program, which always can). */
  listen(): void {
    this.transport.listen?.();
  }

  /** The resources the server offers (the first 100). */
  async listResources(): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5 && resources.length < 100; page++) {
      const result = (await this.transport.request("resources/list", cursor ? { cursor } : {}, 60_000)) as { resources?: McpResource[]; nextCursor?: string };
      resources.push(...(result.resources ?? []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return resources.slice(0, 100);
  }

  async subscribe(uri: string): Promise<void> {
    await this.transport.request("resources/subscribe", { uri }, 30_000);
  }

  /** A resource's text (its text contents joined; a binary one by its type). */
  async readResource(uri: string): Promise<string> {
    const result = (await this.transport.request("resources/read", { uri }, 60_000)) as { contents?: Array<{ text?: string; mimeType?: string; blob?: string }> };
    return (result.contents ?? []).map((c) => c.text ?? `[${c.mimeType ?? "binary"} content]`).join("\n");
  }

  async listTools(): Promise<McpRemoteTool[]> {
    const tools: McpRemoteTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const result = (await this.transport.request("tools/list", cursor ? { cursor } : {}, 60_000)) as { tools?: McpRemoteTool[]; nextCursor?: string };
      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name: string, args: unknown, timeoutMs = CALL_TIMEOUT_MS): Promise<McpCallResult> {
    return resultText(await this.transport.request("tools/call", { name, arguments: args ?? {} }, timeoutMs));
  }

  close(): Promise<void> {
    return this.transport.close();
  }
}
