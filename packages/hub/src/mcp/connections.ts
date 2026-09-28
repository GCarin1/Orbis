// External MCP servers connected to the hub (specs/tool-gateway): the one-click
// marketplace and custom servers. Each server's tools join the registry as
// `mcp.<server>.<tool>` — offered only to the bots whose allowlist names the
// server — and run through the gateway like every other tool (policy,
// approvals, secrets, result cap). Keys, tokens and sign-ins are hub secrets.
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import type { Bot, McpCatalogEntry, McpServer, McpServerTool, McpTransportKind, ToolInfo } from "@orbis/shared";
import { all, get, run } from "../db/index.js";
import type { HubContext } from "../context.js";
import { badRequest, notFound } from "../errors.js";
import { launchCommand, resolveExecutable } from "../brains/process.js";
import { hostEnv } from "../computer/host.js";
import type { HubSecrets } from "../secrets/hub-secrets.js";
import { toolAllowed, untrusted, type ToolDefinition } from "../tools/registry.js";
import { catalogEntry, MCP_CATALOG, type CatalogEntry } from "./catalog.js";
import { HttpTransport, McpAuthError, McpClient, McpError, StdioTransport, type McpCallResult, type McpRemoteTool, type McpTransport } from "./client.js";
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

/** A tool name the registry and every brain accept. */
const safeName = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

export class McpConnections {
  private readonly live = new Map<string, McpClient>();
  private readonly attaching = new Map<string, Promise<void>>();
  private readonly registered = new Map<string, string[]>();
  private readonly authStates = new Map<string, { serverId: string; verifier: string; expires: number }>();
  private readonly authUrls = new Map<string, string>();

  constructor(
    private readonly hub: HubContext,
    private readonly secrets: HubSecrets,
    private readonly opts: { redirectUri(): string; fetchImpl?: typeof fetch },
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
    return row.readOnly || tool.annotations?.readOnlyHint === true;
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  catalog(): Array<McpCatalogEntry & { connected: string | null }> {
    const connected = new Map(this.rows().map((r) => [r.catalogId, r.id]));
    return MCP_CATALOG.map(({ readOnly: _readOnly, ...entry }) => ({ ...entry, connected: connected.get(entry.id) ?? null }));
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
      .map((t) => ({ name: t.name, description: t.description, risk: t.risk, server: t.external ?? null }));
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
        handler: async (input: unknown) => {
          const result = await this.call(row.id, remote.name, input);
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
      if (row.status === "connecting") {
        row.status = row.tools.length ? "connected" : "error";
        row.error = row.tools.length ? null : "the hub stopped while connecting; press Reconnect";
        this.save(row);
      }
      if (row.tools.length) this.registerTools(row);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.live.values()].map((c) => c.close().catch(() => undefined)));
    this.live.clear();
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
      return new StdioTransport(launch.command, launch.args, env, homedir());
    }
    return new HttpTransport(row.url!, () => this.authHeaders(row), this.fetchImpl);
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
    try {
      client = new McpClient(await this.transport(row));
      await client.connect();
      row.tools = await client.listTools();
      this.live.set(id, client);
      row.status = "connected";
      row.error = null;
      this.authUrls.delete(id);
      this.save(row);
      this.registerTools(row);
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
      const { metadata, resource, scope } = await discover(row.url!, wwwAuthenticate, this.fetchImpl);
      const client =
        saved && saved.redirectUri === redirectUri && saved.metadata.token_endpoint === metadata.token_endpoint
          ? saved.client
          : await register(metadata, redirectUri, this.fetchImpl);
      this.writeOAuth(row.id, { metadata, client, resource, redirectUri });
      const { verifier, challenge } = pkce();
      const state = randomBytes(24).toString("base64url");
      this.authStates.set(state, { serverId: row.id, verifier, expires: Date.now() + AUTH_STATE_MS });
      this.authUrls.set(row.id, authorizationUrl(metadata, client, { redirectUri, state, challenge, resource, scope }));
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
        } else secretValues.push(["token", value]);
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
    await this.live
      .get(id)
      ?.close()
      .catch(() => undefined);
    this.live.delete(id);
    this.unregisterTools(id);
    for (const key of row.envKeys) this.secrets.delete(this.secret(id, `env.${key}`));
    this.secrets.delete(this.secret(id, "token"));
    this.secrets.delete(this.secret(id, "oauth"));
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
      // A server that stopped, or a token that expired: connect again once.
      if (!retried && (err instanceof McpAuthError || (err instanceof McpError && /stopped|could not start|session/i.test(err.message)))) {
        this.live.delete(id);
        return this.call(id, remoteName, args, true);
      }
      throw err;
    }
  }
}
