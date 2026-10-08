// External MCP servers connected to the hub (specs/tool-gateway): the one-click
// marketplace and custom servers. Each server's tools join the registry as
// `mcp.<server>.<tool>` — offered only to the bots whose allowlist names the
// server — and run through the gateway like every other tool (policy,
// approvals, secrets, result cap). Keys, tokens and sign-ins are hub secrets.
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import type { Bot, McpCatalogEntry, McpCatalogOAuth, McpServer, McpServerTool, McpTransportKind, ToolInfo } from "@orbis/shared";
import { all, get, run } from "../db/index.js";
import type { HubContext } from "../context.js";
import { badRequest, notFound } from "../errors.js";
import { launchCommand, resolveExecutable } from "../brains/process.js";
import { hostEnv } from "../computer/host.js";
import type { HubSecrets } from "../secrets/hub-secrets.js";
import { toolAllowed, untrusted, type ToolDefinition } from "../tools/registry.js";
import { catalogEntry, MCP_CATALOG, type CatalogEntry } from "./catalog.js";
import {
  HttpTransport,
  McpAuthError,
  McpClient,
  McpError,
  StdioTransport,
  type McpCallResult,
  type McpNotification,
  type McpRemoteTool,
  type McpTransport,
} from "./client.js";
import {
  authorizationUrl,
  discover,
  exchangeCode,
  expiring,
  pkce,
  refreshTokens,
  register,
  type AuthServerMetadata,
  type OAuthClient,
  type OAuthTokens,
} from "./oauth.js";

const AUTH_STATE_MS = 15 * 60_000;
const outdatedError = (name: string) => `${name} now runs another program in the catalog: disconnect it and connect it again`;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

interface Row {
  id: string;
  name: string;
  icon: string;
  catalogId: string | null;
  transport: McpTransportKind;
  url: string | null;
  command: string | null;
  args: string[];
  envKeys: string[];
  auth: McpServer["auth"];
  readOnly: boolean;
  status: McpServer["status"];
  error: string | null;
  tools: McpRemoteTool[];
  createdAt: string;
  updatedAt: string;
}

interface SavedOAuth {
  metadata: AuthServerMetadata;
  client: OAuthClient;
  resource: string;
  redirectUri: string;
  tokens?: OAuthTokens;
}

export interface ConnectInput {
  /** A marketplace entry; its fields' values go in `values`. */
  catalogId?: string;
  values?: Record<string, string>;
  /** A custom server. */
  name?: string;
  transport?: McpTransportKind;
  command?: string;
  args?: string[];
  url?: string;
  /** Custom stdio: environment variables, kept as secrets. Custom http: a bearer token. */
  env?: Record<string, string>;
  token?: string;
}

const toRow = (r: Record<string, unknown>): Row => ({
  id: r.id as string,
  name: r.name as string,
  icon: r.icon as string,
  catalogId: (r.catalog_id as string | null) ?? null,
  transport: r.transport as McpTransportKind,
  url: (r.url as string | null) ?? null,
  command: (r.command as string | null) ?? null,
  args: JSON.parse(r.args as string) as string[],
  envKeys: JSON.parse(r.env_keys as string) as string[],
  auth: r.auth as Row["auth"],
  readOnly: r.read_only === 1,
  status: r.status as Row["status"],
  error: (r.error as string | null) ?? null,
  tools: JSON.parse(r.tools as string) as McpRemoteTool[],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

/** An update a server sent on its own (a log line, a resource that changed), kept until its bots hear of it. */
export interface McpUpdate {
  at: string;
  kind: "message" | "resource";
  /** A message's level (info, notice, warning, error…). */
  level?: string;
  logger?: string;
  /** The message, or the changed resource's address and what it holds now. */
  text: string;
  uri?: string;
}

/** Where a server's batch of updates goes, with the bots that watch it. */
export type UpdateListener = (server: { id: string; name: string }, updates: McpUpdate[], watchers: Bot[], dropped: number) => void;

/** How long the updates of a server are gathered before its bots hear of them. */
export const UPDATE_BATCH_MS = 30_000;
/** The most updates of one server kept for one batch; older ones are left out and counted. */
export const UPDATE_BATCH_MAX = 20;
/** How long the hub waits before starting again a watched server that stopped. */
export const WATCH_RETRY_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000];
const RESOURCE_TEXT = 2_000;

/** A tool name the registry and every brain accept. */
const safeName = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

export class McpConnections {
  private readonly live = new Map<string, McpClient>();
  private readonly attaching = new Map<string, Promise<void>>();
  /** The hub stopped: connections still finishing record nothing and keep nothing. */
  private closed = false;
  private readonly registered = new Map<string, string[]>();
  private readonly authStates = new Map<string, { serverId: string; verifier: string; expires: number }>();
  private readonly authUrls = new Map<string, string>();
  /** The servers kept connected because a bot answers their updates (change 0061). */
  private readonly watched = new Set<string>();
  private readonly wired = new WeakSet<McpClient>();
  private readonly listened = new WeakSet<McpClient>();
  private readonly retries = new Map<string, { attempt: number; timer: NodeJS.Timeout | null }>();
  private readonly updates = new Map<string, { list: McpUpdate[]; dropped: number; timer: NodeJS.Timeout | null }>();
  private updateListener: UpdateListener | null = null;
  private unsubscribe: (() => void) | null = null;
  private watchTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly hub: HubContext,
    private readonly secrets: HubSecrets,
    private readonly opts: { redirectUri(): string; fetchImpl?: typeof fetch; updateBatchMs?: number; watchRetryMs?: number[] },
  ) {}

  private get fetchImpl(): typeof fetch {
    return this.opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  // --- storage ---------------------------------------------------------------------------------

  private row(id: string): Row | undefined {
    const r = get(this.hub.db, "SELECT * FROM mcp_servers WHERE id = ?", id);
    return r ? toRow(r) : undefined;
  }

  private rows(): Row[] {
    return all(this.hub.db, "SELECT * FROM mcp_servers ORDER BY created_at").map(toRow);
  }

  private save(row: Row): void {
    // A connection that ends after the hub stopped (its database closed) has nothing left to record.
    if (this.closed) return;
    row.updatedAt = new Date().toISOString();
    run(
      this.hub.db,
      `INSERT INTO mcp_servers (id, name, icon, catalog_id, transport, url, command, args, env_keys, auth, read_only, status, error, tools, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, error = excluded.error, tools = excluded.tools, updated_at = excluded.updated_at`,
      row.id,
      row.name,
      row.icon,
      row.catalogId,
      row.transport,
      row.url,
      row.command,
      JSON.stringify(row.args),
      JSON.stringify(row.envKeys),
      row.auth,
      row.readOnly ? 1 : 0,
      row.status,
      row.error,
      JSON.stringify(row.tools),
      row.createdAt,
      row.updatedAt,
    );
    this.hub.bus.publish("mcp.updated", { server: this.toServer(row) });
  }

  private secret = (id: string, what: string) => `mcp.${id}.${what}`;

  private readOAuth(id: string): SavedOAuth | null {
    const raw = this.secrets.get(this.secret(id, "oauth"));
    return raw ? (JSON.parse(raw) as SavedOAuth) : null;
  }

  private writeOAuth(id: string, value: SavedOAuth): void {
    this.secrets.set(this.secret(id, "oauth"), JSON.stringify(value));
  }

  // --- what clients see --------------------------------------------------------------------------

  private toolName = (id: string, remote: string) => `mcp.${id}.${safeName(remote)}`;

  private isReadOnly(row: Row, tool: McpRemoteTool): boolean {
    if (row.readOnly || tool.annotations?.readOnlyHint === true) return true;
    return Boolean(row.catalogId && catalogEntry(row.catalogId)?.readOnlyTools?.includes(tool.name));
  }

  /** A program connected from a catalog entry that now starts another one (a server replaced, a new pinned version). */
  private outdated(row: Row): boolean {
    const entry = row.catalogId ? catalogEntry(row.catalogId) : undefined;
    if (!entry || entry.transport !== "stdio" || row.transport !== "stdio") return false;
    const args = entry.args ?? [];
    return row.command !== entry.command || args.some((arg, i) => row.args[i] !== arg);
  }

  private botsOf(row: Row): string[] {
    const names = row.tools.map((t) => this.toolName(row.id, t.name));
    const probe = names.length ? names : [`mcp.${row.id}.any`];
    return this.hub.repos.bots
      .list({ includeHidden: true })
      .filter((bot) => probe.some((name) => toolAllowed(name, bot.tools, true)))
      .map((bot) => bot.id);
  }

  toServer(row: Row): McpServer {
    const tools: McpServerTool[] = row.tools.map((t) => ({
      name: this.toolName(row.id, t.name),
      remoteName: t.name,
      description: t.description ?? t.annotations?.title ?? "",
      readOnly: this.isReadOnly(row, t),
    }));
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      logo: (row.catalogId ? catalogEntry(row.catalogId)?.logo : undefined) ?? null,
      catalogId: row.catalogId,
      transport: row.transport,
      url: row.url,
      command: row.command,
      args: row.args,
      auth: row.auth,
      status: row.status,
      error: row.error,
      authUrl: row.status === "needs_auth" ? (this.authUrls.get(row.id) ?? null) : null,
      tools,
      bots: this.botsOf(row),
      watchers: this.watchersOf(row).map((b) => b.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  catalog(): Array<McpCatalogEntry & { connected: string | null }> {
    const connected = new Map(this.rows().map((r) => [r.catalogId, r.id]));
    return MCP_CATALOG.map((entry) => ({ ...entry, connected: connected.get(entry.id) ?? null }));
  }

  list(): McpServer[] {
    return this.rows().map((r) => this.toServer(r));
  }

  get(id: string): McpServer {
    const row = this.row(id);
    if (!row) throw notFound(`MCP server ${id}`);
    return this.toServer(row);
  }

  /** Every registered tool, for choosing a bot's tools. */
  toolInfos(): ToolInfo[] {
    return this.hub.tools
      .list()
      .filter((t) => !t.ungated)
      .map((t) => ({ name: t.name, description: t.description, risk: t.risk, server: t.external ?? null, ...(t.explicitPrefix ? { explicit: t.explicitPrefix } : {}) }));
  }

  // --- tools in the registry ----------------------------------------------------------------------

  private registerTools(row: Row): void {
    for (const name of this.registered.get(row.id) ?? []) this.hub.tools.unregister(name);
    const names: string[] = [];
    for (const remote of row.tools) {
      const name = this.toolName(row.id, remote.name);
      const readOnly = this.isReadOnly(row, remote);
      const tool: ToolDefinition = {
        name,
        description: `${row.name}: ${remote.description ?? remote.annotations?.title ?? remote.name}`.slice(0, 2_000),
        input: (remote.inputSchema ?? { type: "object" }) as never,
        risk: readOnly ? "read" : "external",
        defaultDecision: readOnly ? "allow" : "ask",
        secrets: true,
        external: row.id,
        handler: async (input: unknown, ctx) => {
          // A run that is stopped does not wait for a slow server.
          const stopped = new Promise<never>((_, reject) => {
            if (ctx.signal.aborted) reject(new Error("the run was stopped"));
            ctx.signal.addEventListener("abort", () => reject(new Error("the run was stopped")), { once: true });
          });
          stopped.catch(() => undefined);
          const result = await Promise.race([this.call(row.id, remote.name, input), stopped]);
          return { output: untrusted(`mcp:${row.id}`, result.text || "(empty result)"), isError: result.isError };
        },
      };
      this.hub.tools.register(tool);
      names.push(name);
    }
    this.registered.set(row.id, names);
  }

  private unregisterTools(id: string): void {
    for (const name of this.registered.get(id) ?? []) this.hub.tools.unregister(name);
    this.registered.delete(id);
  }

  /** At hub start: the tools of every server are known from the last connection; servers start on first use. */
  start(): void {
    for (const row of this.rows()) {
      if (this.outdated(row)) {
        row.status = "error";
        row.error = outdatedError(row.name);
        row.tools = [];
        this.save(row);
        continue;
      }
      if (row.status === "connecting") {
        row.status = row.tools.length ? "connected" : "error";
        row.error = row.tools.length ? null : "the hub stopped while connecting; press Reconnect";
        this.save(row);
      }
      if (row.tools.length) this.registerTools(row);
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    for (const retry of this.retries.values()) if (retry.timer) clearTimeout(retry.timer);
    for (const batch of this.updates.values()) if (batch.timer) clearTimeout(batch.timer);
    this.retries.clear();
    this.updates.clear();
    this.watched.clear();
    await Promise.all([...this.live.values()].map((c) => c.close().catch(() => undefined)));
    this.live.clear();
  }

  // --- updates the servers send on their own (change 0061) ------------------------------------------

  /** Where the batches of updates go (the bots' initiative). */
  onUpdates(listener: UpdateListener): void {
    this.updateListener = listener;
  }

  /** The bots that answer the updates of a server: given it, with initiative and its MCP updates on. */
  watchersOf(row: Pick<Row, "id" | "tools">): Bot[] {
    const names = row.tools.map((t) => this.toolName(row.id, t.name));
    const probe = names.length ? names : [`mcp.${row.id}.any`];
    return this.hub.repos.bots
      .list({ includeHidden: true })
      .filter((bot) => bot.initiative?.enabled && bot.initiative.mcpUpdates)
      .filter((bot) => probe.some((name) => toolAllowed(name, bot.tools, true)));
  }

  /** Keep connected the servers some bot watches, now and whenever a bot changes. */
  startWatching(): void {
    this.refreshWatches();
    this.unsubscribe = this.hub.bus.subscribe((event) => {
      if (event.type !== "bot.updated" && event.type !== "bot.deleted") return;
      if (this.watchTimer) return;
      this.watchTimer = setTimeout(() => {
        this.watchTimer = null;
        this.refreshWatches();
      }, 500);
      this.watchTimer.unref();
    });
  }

  /** Which servers are watched now; a newly watched one is connected and listened to. */
  refreshWatches(): void {
    for (const row of this.rows()) {
      const watching = row.status === "connected" && this.watchersOf(row).length > 0;
      if (watching && !this.watched.has(row.id)) {
        this.watched.add(row.id);
        const client = this.live.get(row.id);
        if (client) this.wire(row.id, client);
        else void this.attach(row.id);
      } else if (!watching && this.watched.has(row.id)) {
        this.watched.delete(row.id);
        this.cancelRetry(row.id);
      }
    }
  }

  /** Whether a server is kept connected for its watchers. */
  isWatched(id: string): boolean {
    return this.watched.has(id);
  }

  /** Hear what a connected server sends; for a watched one, listen between requests and subscribe to its resources. */
  private wire(id: string, client: McpClient): void {
    if (!this.wired.has(client)) {
      this.wired.add(client);
      client.onNotification((n) => this.fromServer(id, client, n));
      client.onClose((why) => this.lost(id, client, why));
    }
    if (this.watched.has(id) && !this.listened.has(client)) {
      this.listened.add(client);
      client.listen();
      void this.subscribeAll(client);
    }
  }

  private async subscribeAll(client: McpClient): Promise<void> {
    if (!client.capabilities.resources?.subscribe) return;
    try {
      for (const resource of await client.listResources()) await client.subscribe(resource.uri).catch(() => undefined);
    } catch {
      /* a server whose resources cannot be listed still sends its messages */
    }
  }

  /** A watched server that stopped is started again, later and later while it keeps stopping. */
  private lost(id: string, client: McpClient, _why: string): void {
    if (this.live.get(id) === client) this.live.delete(id);
    if (!this.watched.has(id)) return;
    const retry = this.retries.get(id) ?? { attempt: 0, timer: null };
    if (retry.timer) return;
    const delays = this.opts.watchRetryMs ?? WATCH_RETRY_MS;
    const ms = delays[Math.min(retry.attempt, delays.length - 1)]!;
    retry.timer = setTimeout(() => {
      retry.timer = null;
      retry.attempt++;
      if (!this.watched.has(id)) return;
      void this.attach(id).then(() => {
        const again = this.live.get(id);
        if (again) retry.attempt = 0;
        else if (this.watched.has(id)) this.lost(id, client, "still not connected");
      });
    }, ms);
    retry.timer.unref();
    this.retries.set(id, retry);
  }

  private cancelRetry(id: string): void {
    const retry = this.retries.get(id);
    if (retry?.timer) clearTimeout(retry.timer);
    this.retries.delete(id);
  }

  private fromServer(id: string, client: McpClient, n: McpNotification): void {
    switch (n.method) {
      case "notifications/tools/list_changed":
        void this.refreshTools(id, client);
        return;
      case "notifications/resources/list_changed":
        if (this.watched.has(id)) void this.subscribeAll(client);
        return;
      case "notifications/resources/updated": {
        const uri = String(n.params.uri ?? "");
        if (uri) this.queue(id, { at: new Date().toISOString(), kind: "resource", uri, text: uri });
        return;
      }
      case "notifications/message": {
        const level = String(n.params.level ?? "info");
        if (level === "debug") return;
        const data = n.params.data;
        const text = typeof data === "string" ? data : JSON.stringify(data ?? "");
        const logger = typeof n.params.logger === "string" ? n.params.logger : undefined;
        this.queue(id, { at: new Date().toISOString(), kind: "message", level, ...(logger ? { logger } : {}), text: text.slice(0, 4_000) });
        return;
      }
    }
  }

  /** A server's tools changed: list them again, so the bots get the new ones. */
  private async refreshTools(id: string, client: McpClient): Promise<void> {
    try {
      const row = this.row(id);
      if (!row || this.live.get(id) !== client) return;
      row.tools = await client.listTools();
      this.save(row);
      this.registerTools(row);
    } catch {
      /* the old list stays */
    }
  }

  /** Gather a watched server's updates for a while, so its bots hear of them together. */
  private queue(id: string, update: McpUpdate): void {
    if (!this.watched.has(id)) return;
    const batch = this.updates.get(id) ?? { list: [], dropped: 0, timer: null };
    batch.list.push(update);
    if (batch.list.length > UPDATE_BATCH_MAX) {
      batch.list.shift();
      batch.dropped++;
    }
    if (!batch.timer) {
      batch.timer = setTimeout(() => void this.flush(id), this.opts.updateBatchMs ?? UPDATE_BATCH_MS);
      batch.timer.unref();
    }
    this.updates.set(id, batch);
  }

  private async flush(id: string): Promise<void> {
    const batch = this.updates.get(id);
    this.updates.delete(id);
    const row = this.row(id);
    if (!batch || !row) return;
    const watchers = this.watchersOf(row);
    if (!watchers.length) return;
    // A changed resource is read once per batch, so the bot sees what it holds now.
    const client = this.live.get(id);
    const read = new Map<string, string>();
    for (const update of batch.list) {
      if (update.kind !== "resource" || !update.uri || !client) continue;
      if (!read.has(update.uri)) read.set(update.uri, (await client.readResource(update.uri).catch(() => "")).slice(0, RESOURCE_TEXT));
      const content = read.get(update.uri);
      if (content) update.text = `${update.uri}\n${content}`;
    }
    this.updateListener?.({ id: row.id, name: row.name }, batch.list, watchers, batch.dropped);
  }

  // --- connecting ------------------------------------------------------------------------------------

  private async transport(row: Row): Promise<McpTransport> {
    if (row.transport === "stdio") {
      const exe = resolveExecutable(row.command ?? "");
      if (!exe) {
        throw new McpError(
          `"${row.command}" is not installed on this computer${row.command === "npx" ? ": install Node.js from https://nodejs.org and try again" : ""}`,
        );
      }
      const launch = launchCommand(exe, row.args);
      const env = hostEnv();
      for (const key of row.envKeys) {
        const value = this.secrets.get(this.secret(row.id, `env.${key}`));
        if (value !== null) env[key] = value;
      }
      Object.assign(env, await this.signInEnv(row));
      return new StdioTransport(launch.command, launch.args, env, homedir());
    }
    // A key the service takes in its address (Alpha Vantage's ?apikey=) is added here, from the vault, and
    // left out of the address the errors quote.
    const url = new URL(row.url!);
    for (const field of (row.catalogId ? catalogEntry(row.catalogId)?.fields : undefined) ?? []) {
      const value = field.target === "query" ? this.secrets.get(this.secret(row.id, `query.${field.key}`)) : null;
      if (value) url.searchParams.set(field.key, value);
    }
    return new HttpTransport(url.href, () => this.authHeaders(row), this.fetchImpl, row.url!);
  }

  private async authHeaders(row: Row): Promise<Record<string, string>> {
    const token = this.secrets.get(this.secret(row.id, "token"));
    if (token) return { authorization: `Bearer ${token}` };
    if (row.auth !== "oauth") return {};
    const saved = this.readOAuth(row.id);
    if (!saved?.tokens) return {};
    if (expiring(saved.tokens) && saved.tokens.refresh_token) {
      try {
        saved.tokens = await refreshTokens(saved.metadata, saved.client, saved.tokens, saved.resource, this.fetchImpl);
        this.writeOAuth(row.id, saved);
      } catch {
        /* the server answers 401 and the user signs in again */
      }
    }
    return { authorization: `Bearer ${saved.tokens.access_token}` };
  }

  /** The sign-in of a server Orbis signs in for (a catalog entry with `oauth`), or undefined. */
  private signInOf(row: Row): McpCatalogOAuth | undefined {
    return row.auth === "oauth" && row.catalogId ? catalogEntry(row.catalogId)?.oauth : undefined;
  }

  /** The user's own OAuth client, from the entry's client fields. */
  private ownClient(row: Row): OAuthClient | null {
    const clientId = this.secrets.get(this.secret(row.id, "client_id"));
    if (!clientId) return null;
    const clientSecret = this.secrets.get(this.secret(row.id, "client_secret"));
    return { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) };
  }

  /** A program Orbis signs in for: its tokens and client as the environment variables the entry names. */
  private async signInEnv(row: Row): Promise<Record<string, string>> {
    const oauth = this.signInOf(row);
    const saved = oauth ? this.readOAuth(row.id) : null;
    if (!oauth || !saved?.tokens) return {};
    if (expiring(saved.tokens) && saved.tokens.refresh_token) {
      try {
        saved.tokens = await refreshTokens(saved.metadata, saved.client, saved.tokens, saved.resource, this.fetchImpl);
        this.writeOAuth(row.id, saved);
      } catch {
        /* the program refreshes it itself, or the user signs in again */
      }
    }
    const env: Record<string, string> = { [oauth.env.accessToken]: saved.tokens.access_token };
    if (oauth.env.refreshToken && saved.tokens.refresh_token) env[oauth.env.refreshToken] = saved.tokens.refresh_token;
    if (oauth.env.clientId) env[oauth.env.clientId] = saved.client.client_id;
    if (oauth.env.clientSecret && saved.client.client_secret) env[oauth.env.clientSecret] = saved.client.client_secret;
    return env;
  }

  /** Connect once at a time per server: initialize, list tools, register them. */
  private attach(id: string): Promise<void> {
    let pending = this.attaching.get(id);
    if (!pending) {
      pending = this.doAttach(id).finally(() => this.attaching.delete(id));
      this.attaching.set(id, pending);
    }
    return pending;
  }

  private async doAttach(id: string): Promise<void> {
    const row = this.row(id);
    if (!row) return;
    const old = this.live.get(id);
    this.live.delete(id);
    await old?.close().catch(() => undefined);
    let client: McpClient | null = null;
    if (this.outdated(row)) {
      row.status = "error";
      row.error = outdatedError(row.name);
      this.save(row);
      return;
    }
    // A program that cannot sign in by itself starts only once the user signed in through Orbis.
    if (this.signInOf(row) && !this.readOAuth(row.id)?.tokens) return this.beginAuth(row, null);
    try {
      client = new McpClient(await this.transport(row));
      await client.connect();
      row.tools = await client.listTools();
      // The hub stopped while this server was connecting: nothing may use it now.
      if (this.closed) {
        await client.close().catch(() => undefined);
        return;
      }
      this.live.set(id, client);
      row.status = "connected";
      row.error = null;
      this.authUrls.delete(id);
      this.save(row);
      this.registerTools(row);
      // A server a bot watches is listened to from the moment it connects.
      if (this.watchersOf(row).length) this.watched.add(id);
      this.wire(id, client);
    } catch (err) {
      await client?.close().catch(() => undefined);
      if (err instanceof McpAuthError && row.auth === "oauth") return this.beginAuth(row, err.wwwAuthenticate);
      row.status = "error";
      row.error =
        err instanceof McpAuthError
          ? `${row.name} refused the ${row.auth === "token" ? "key or token" : "request"} (401): check it and connect again`
          : err instanceof Error
            ? err.message
            : String(err);
      this.save(row);
    }
  }

  /** The server wants the user's account: register Orbis, then wait for the user to sign in. */
  private async beginAuth(row: Row, wwwAuthenticate: string | null): Promise<void> {
    try {
      const redirectUri = this.opts.redirectUri();
      const saved = this.readOAuth(row.id);
      // A stored refresh token may still work.
      if (saved?.tokens?.refresh_token && !this.attaching.has(`${row.id}:refresh`)) {
        try {
          saved.tokens = await refreshTokens(saved.metadata, saved.client, saved.tokens, saved.resource, this.fetchImpl);
          this.writeOAuth(row.id, saved);
          const retry = this.doAttach(row.id);
          this.attaching.set(`${row.id}:refresh`, retry);
          await retry.finally(() => this.attaching.delete(`${row.id}:refresh`));
          return;
        } catch {
          /* sign in again below */
        }
      }
      const signIn = this.signInOf(row);
      const own = this.ownClient(row);
      const { metadata, resource, scope } = signIn
        ? { metadata: { authorization_endpoint: signIn.authorizationEndpoint, token_endpoint: signIn.tokenEndpoint }, resource: "", scope: signIn.scope }
        : await discover(row.url!, wwwAuthenticate, this.fetchImpl);
      if (signIn && !own) throw new Error(`${row.name} needs your own OAuth client: disconnect it and connect again with its client ID and secret`);
      const client =
        own ??
        (saved && saved.redirectUri === redirectUri && saved.metadata.token_endpoint === metadata.token_endpoint
          ? saved.client
          : await register(metadata, redirectUri, this.fetchImpl));
      this.writeOAuth(row.id, { metadata, client, resource, redirectUri });
      const { verifier, challenge } = pkce();
      const state = randomBytes(24).toString("base64url");
      this.authStates.set(state, { serverId: row.id, verifier, expires: Date.now() + AUTH_STATE_MS });
      this.authUrls.set(row.id, authorizationUrl(metadata, client, { redirectUri, state, challenge, resource, scope, params: signIn?.params }));
      row.status = "needs_auth";
      row.error = null;
      this.save(row);
    } catch (err) {
      row.status = "error";
      row.error = err instanceof Error ? err.message : String(err);
      this.save(row);
    }
  }

  /** The user came back from signing in (`/oauth/mcp/callback`). */
  async completeAuth(state: string, code: string | undefined, error: string | undefined): Promise<McpServer> {
    const pending = this.authStates.get(state);
    this.authStates.delete(state);
    if (!pending || pending.expires < Date.now()) throw badRequest("this sign-in link expired or was already used; press Connect again in Orbis");
    const row = this.row(pending.serverId);
    if (!row) throw notFound(`MCP server ${pending.serverId}`);
    const saved = this.readOAuth(row.id);
    if (error || !code || !saved) {
      row.status = "error";
      row.error = `the sign-in was not completed${error ? ` (${error})` : ""}`;
      this.authUrls.delete(row.id);
      this.save(row);
      return this.toServer(row);
    }
    try {
      saved.tokens = await exchangeCode(
        saved.metadata,
        saved.client,
        { code, verifier: pending.verifier, redirectUri: saved.redirectUri, resource: saved.resource },
        this.fetchImpl,
      );
      this.writeOAuth(row.id, saved);
    } catch (err) {
      row.status = "error";
      row.error = err instanceof Error ? err.message : String(err);
      this.save(row);
      return this.toServer(row);
    }
    row.status = "connecting";
    this.save(row);
    await this.attach(row.id);
    return this.get(row.id);
  }

  /** Connect a marketplace entry or a custom server; resolves at once with status `connecting`. */
  connect(input: ConnectInput): McpServer {
    const entry: CatalogEntry | undefined = input.catalogId ? catalogEntry(input.catalogId) : undefined;
    if (input.catalogId && !entry) throw badRequest("unknown marketplace entry", { catalogId: `no server ${input.catalogId}` });
    const now = new Date().toISOString();
    const secretValues: Array<[string, string]> = [];
    let row: Row;
    if (entry) {
      if (this.rows().some((r) => r.catalogId === entry.id)) throw badRequest(`${entry.name} is already connected`, { catalogId: "already connected" });
      const values = input.values ?? {};
      const args = [...(entry.args ?? [])];
      const envKeys: string[] = [];
      for (const field of entry.fields) {
        const value = values[field.key]?.trim() ?? "";
        if (!value) {
          if (field.optional) continue;
          throw badRequest(`${field.label.en} is required`, { [`values.${field.key}`]: "required" });
        }
        if (field.target === "arg") args.push(value);
        else if (field.target === "env") {
          envKeys.push(field.key);
          secretValues.push([`env.${field.key}`, value]);
        } else if (field.target === "query") secretValues.push([`query.${field.key}`, value]);
        else if (field.target === "client_id" || field.target === "client_secret") secretValues.push([field.target, value]);
        else secretValues.push(["token", value]);
      }
      row = {
        id: entry.id,
        name: entry.name,
        icon: entry.icon,
        catalogId: entry.id,
        transport: entry.transport,
        url: entry.url ?? null,
        command: entry.command ?? null,
        args,
        envKeys,
        auth: entry.auth,
        readOnly: entry.readOnly ?? false,
        status: "connecting",
        error: null,
        tools: [],
        createdAt: now,
        updatedAt: now,
      };
    } else {
      const name = input.name?.trim();
      if (!name) throw badRequest("give the server a name", { name: "required" });
      const transport = input.transport ?? (input.url ? "http" : "stdio");
      if (transport === "http") {
        try {
          const url = new URL(input.url ?? "");
          if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("not http");
        } catch {
          throw badRequest("not an http address", { url: "the server's streamable HTTP address, e.g. https://example.com/mcp" });
        }
      } else if (!input.command?.trim()) throw badRequest("give the command that starts the server", { command: "required, e.g. npx" });
      const envKeys = Object.keys(input.env ?? {}).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
      for (const key of envKeys) secretValues.push([`env.${key}`, input.env![key]!]);
      if (input.token) secretValues.push(["token", input.token]);
      let id =
        safeName(name.toLowerCase())
          .replace(/_/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24) || "server";
      if (!ID.test(id)) id = "server";
      for (let n = 2; this.row(id) || catalogEntry(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
      row = {
        id,
        name,
        icon: transport === "http" ? "🌐" : "🧩",
        catalogId: null,
        transport,
        url: transport === "http" ? input.url!.trim() : null,
        command: transport === "stdio" ? input.command!.trim() : null,
        args: transport === "stdio" ? (input.args ?? []) : [],
        envKeys,
        auth: input.token ? "token" : transport === "http" ? "oauth" : "none",
        readOnly: false,
        status: "connecting",
        error: null,
        tools: [],
        createdAt: now,
        updatedAt: now,
      };
    }
    for (const [what, value] of secretValues) this.secrets.set(this.secret(row.id, what), value);
    this.save(row);
    void this.attach(row.id);
    return this.toServer(row);
  }

  /** Wait for the connection attempt in progress (tests, the CLI). */
  async ready(id: string): Promise<McpServer> {
    await this.attaching.get(id);
    return this.get(id);
  }

  reconnect(id: string): McpServer {
    const row = this.row(id);
    if (!row) throw notFound(`MCP server ${id}`);
    row.status = "connecting";
    row.error = null;
    this.save(row);
    void this.attach(id);
    return this.toServer(row);
  }

  /** Disconnect: stop it, forget its tools, keys and sign-in, and take it out of every bot's allowlist. */
  async remove(id: string): Promise<void> {
    const row = this.row(id);
    if (!row) throw notFound(`MCP server ${id}`);
    this.watched.delete(id);
    this.cancelRetry(id);
    const batch = this.updates.get(id);
    if (batch?.timer) clearTimeout(batch.timer);
    this.updates.delete(id);
    await this.live
      .get(id)
      ?.close()
      .catch(() => undefined);
    this.live.delete(id);
    this.unregisterTools(id);
    for (const key of row.envKeys) this.secrets.delete(this.secret(id, `env.${key}`));
    for (const field of (row.catalogId ? catalogEntry(row.catalogId)?.fields : undefined) ?? []) {
      if (field.target === "query") this.secrets.delete(this.secret(id, `query.${field.key}`));
    }
    for (const what of ["token", "oauth", "client_id", "client_secret"]) this.secrets.delete(this.secret(id, what));
    this.authUrls.delete(id);
    run(this.hub.db, "DELETE FROM mcp_servers WHERE id = ?", id);
    const prefix = `mcp.${id}.`;
    for (const bot of this.hub.repos.bots.list({ includeHidden: true })) {
      const kept = bot.tools.filter((p) => !p.replace(/^!/, "").startsWith(prefix));
      if (kept.length !== bot.tools.length) this.hub.botService.update(bot.id, { tools: kept.length ? kept : ["*"] });
    }
    this.hub.bus.publish("mcp.deleted", { serverId: id });
  }

  /** Give or take a server's tools from a bot (`mcp.<server>.*` in its allowlist). */
  setBotAccess(id: string, botId: string, on: boolean): Bot {
    const row = this.row(id);
    if (!row) throw notFound(`MCP server ${id}`);
    const bot = this.hub.botService.get(botId);
    const pattern = `mcp.${id}.*`;
    const prefix = `mcp.${id}.`;
    const others = bot.tools.filter((p) => !p.replace(/^!/, "").startsWith(prefix));
    const tools = on ? [...(others.length ? others : ["*"]), pattern] : others.length ? others : ["*"];
    const updated = this.hub.botService.update(bot.id, { tools });
    this.hub.bus.publish("mcp.updated", { server: this.toServer(row) });
    return updated;
  }

  // --- calling -------------------------------------------------------------------------------------

  private async call(id: string, remoteName: string, args: unknown, retried = false): Promise<McpCallResult> {
    let client = this.live.get(id);
    if (!client) {
      await this.attach(id);
      client = this.live.get(id);
      const row = this.row(id);
      if (!client || !row) {
        throw new Error(
          row?.status === "needs_auth"
            ? `${row.name} needs the user to sign in again (Orbis → Tools → Connected)`
            : `${row?.name ?? id} is not connected${row?.error ? `: ${row.error}` : ""}`,
        );
      }
    }
    try {
      return await client.callTool(remoteName, args);
    } catch (err) {
      // A server that stopped, a token that expired, or an HTTP session the server ended (404): connect again once.
      if (!retried && (err instanceof McpAuthError || (err instanceof McpError && /stopped|could not start|session|answered 404/i.test(err.message)))) {
        this.live.delete(id);
        void client.close().catch(() => undefined);
        return this.call(id, remoteName, args, true);
      }
      throw err;
    }
  }
}
