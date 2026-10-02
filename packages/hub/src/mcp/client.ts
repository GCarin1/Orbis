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

export interface McpTransport {
  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

type Pending = { resolve(value: unknown): void; reject(err: Error): void; timer: NodeJS.Timeout };

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
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
        // A request from the server (sampling, roots…): Orbis offers none of these.
        this.write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Orbis does not support ${msg.method}` } });
        return;
      }
      settle(this.pending, msg);
    });
    this.child.stderr!.on("data", (d: Buffer) => {
      this.stderr = (this.stderr + d.toString("utf8")).slice(-STDERR_TAIL);
    });
    const fail = (why: string) => {
      this.exited = why;
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

  async close(): Promise<void> {
    if (this.exited) return;
    this.child.stdin?.end();
    const gone = new Promise<void>((r) => this.child.once("exit", () => r()));
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
    this.child.kill("SIGTERM");
    await gone;
    clearTimeout(timer);
  }
}

/** The JSON-RPC answer inside a server-sent event stream. */
async function readEventStream(res: Response, id: number): Promise<RpcMessage | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
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
      try {
        const msg = JSON.parse(data) as RpcMessage;
        if (msg.id === id) {
          await reader.cancel().catch(() => undefined);
          return msg;
        }
      } catch {
        /* not JSON: skip */
      }
    }
    if (done) return null;
  }
}

/** A streamable HTTP server: each message is a POST; the answer is JSON or an event stream. */
export class HttpTransport implements McpTransport {
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private nextId = 1;

  constructor(
    private readonly url: string,
    /** Extra headers for every request, read each time (a refreshed token). */
    private readonly headers: () => Promise<Record<string, string>> = async () => ({}),
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
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
      throw new McpError(`${this.url} did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw new McpError(`${this.url} answered ${res.status}${text ? `: ${text}` : ""}`);
    }
    const type = res.headers.get("content-type") ?? "";
    const msg = type.includes("text/event-stream") ? await readEventStream(res, id) : ((await res.json()) as RpcMessage);
    if (!msg) throw new McpError(`${this.url} closed the stream without answering ${method}`);
    if (msg.error) throw new McpError(`${msg.error.message} (${msg.error.code})`);
    return msg.result;
  }

  async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    const res = await this.post({ jsonrpc: "2.0", method, params }, 30_000);
    await res.body?.cancel().catch(() => undefined);
  }

  async close(): Promise<void> {
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

export class McpClient {
  constructor(private readonly transport: McpTransport) {}

  /** `initialize`, then `notifications/initialized`; resolves with the server's name. */
  async connect(timeoutMs = CONNECT_TIMEOUT_MS): Promise<{ name: string; version: string; instructions: string | null }> {
    const result = (await this.transport.request(
      "initialize",
      { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "orbis", version: ORBIS_VERSION } },
      timeoutMs,
    )) as { protocolVersion?: string; serverInfo?: { name?: string; version?: string }; instructions?: string };
    if (this.transport instanceof HttpTransport) this.transport.setProtocolVersion(result.protocolVersion ?? MCP_PROTOCOL_VERSION);
    await this.transport.notify("notifications/initialized");
    return { name: result.serverInfo?.name ?? "?", version: result.serverInfo?.version ?? "?", instructions: result.instructions ?? null };
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
