// specs/tool-gateway — external MCP servers (change 0018-mcp-marketplace): a
// stdio server started by the hub with its key as a secret, an HTTP server
// that asks the user to sign in (OAuth discovery, dynamic registration, PKCE,
// the callback) and answers over server-sent events, tools offered only to the
// bots given the server, writes that ask first, and a clean disconnect.
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Run } from "@orbis/shared";
import { MCP_CATALOG } from "../src/mcp/catalog.js";
import { defaultDecisionOf } from "../src/tools/registry.js";
import { chat, createBot, FIXTURES, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result");
const fakeStdio = { name: "Fake Notes", transport: "stdio", command: process.execPath, args: [path.join(FIXTURES, "fake-mcp-server.mjs"), "from-arg"] };

describe("a stdio MCP server", () => {
  it("starts it with its key as a secret, lists its tools, and gives them only to the bots it is given to", async () => {
    t = await testHub();
    const started = await t.api("POST", "/api/v1/mcp/servers", { ...fakeStdio, env: { GREETING: "hello-secret-greeting" } });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ id: "fake-notes", status: "connecting", icon: "🧩" });
    const ready = await t.hub.mcp.ready("fake-notes");
    expect(ready.status).toBe("connected");
    expect(ready.tools).toEqual([
      { name: "mcp.fake-notes.echo", remoteName: "echo", description: "Repeat a text", readOnly: true },
      { name: "mcp.fake-notes.create_note", remoteName: "create_note", description: "Create a note", readOnly: false },
    ]);
    for (const file of readdirSync(t.dataDir).filter((f) => f.startsWith("orbis.db"))) {
      expect(readFileSync(path.join(t.dataDir, file)).includes(Buffer.from("hello-secret-greeting"))).toBe(false);
    }

    // `*` never includes a server the user did not give the bot.
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const names = (bot: { id: string }) => t!.hub.gateway.toolsFor(t!.hub.botService.get(bot.id)).map((tool) => tool.name);
    expect(names(ana).some((n) => n.startsWith("mcp."))).toBe(false);
    const given = await t.api("POST", "/api/v1/mcp/servers/fake-notes/bots", { botId: ana.id, enabled: true });
    expect(given.body.bots).toEqual([ana.id]);
    expect(t.hub.botService.get(ana.id).tools).toEqual(["*", "mcp.fake-notes.*"]);
    expect(names(ana)).toEqual(expect.arrayContaining(["mcp.fake-notes.echo", "mcp.fake-notes.create_note", "computer.shell"]));
    expect(names(bob).some((n) => n.startsWith("mcp."))).toBe(false);

    // Reading runs at once, through the gateway, marked as outside content; writing asks first.
    const { runs } = await chat(t, ana.id, `/tool mcp.fake-notes.echo {"text":"ping"}`);
    const [echo] = results(runs[0]!);
    expect(echo!.isError).toBe(false);
    expect(echo!.output).toContain('<untrusted-content source="mcp:fake-notes">');
    // The key reached the server's environment and the folder its arguments.
    expect(echo!.output).toContain("hello-secret-greeting | from-arg | ping");
    const write = t.hub.tools.get("mcp.fake-notes.create_note")!;
    expect(defaultDecisionOf(write, t.hub.botService.get(ana.id))).toBe("ask");
    expect(defaultDecisionOf(t.hub.tools.get("mcp.fake-notes.echo"), t.hub.botService.get(ana.id))).toBe("allow");
    // A rule of the bot's policy can allow it.
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { policy: { rules: [{ tool: "mcp.fake-notes.*", decision: "allow" }], grants: [] } });
    const note = await chat(t, ana.id, `/tool mcp.fake-notes.create_note {"title":"Launch"}`);
    expect(results(note.runs[0]!)[0]!.output).toContain('note "Launch" created');
    // An exclusion wins over the server pattern.
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { tools: ["*", "mcp.fake-notes.*", "!mcp.fake-notes.create_note"] });
    expect(names(ana)).toContain("mcp.fake-notes.echo");
    expect(names(ana)).not.toContain("mcp.fake-notes.create_note");

    // Tools of every kind are listed for the bot settings screen.
    const tools = (await t.api("GET", "/api/v1/tools")).body as Array<{ name: string; server: string | null }>;
    expect(tools.find((x) => x.name === "mcp.fake-notes.echo")?.server).toBe("fake-notes");
    expect(tools.find((x) => x.name === "computer.shell")?.server).toBeNull();

    // Disconnecting forgets the tools and takes the server out of every allowlist.
    expect((await t.api("DELETE", "/api/v1/mcp/servers/fake-notes")).status).toBe(204);
    expect(t.hub.tools.get("mcp.fake-notes.echo")).toBeUndefined();
    expect(t.hub.botService.get(ana.id).tools).toEqual(["*"]);
    expect((await t.api("GET", "/api/v1/mcp/servers")).body).toEqual([]);
  });

  it("keeps the tools across a restart and starts the server again on first use", async () => {
    t = await testHub();
    t.hub.mcp.connect({ ...fakeStdio, transport: "stdio", env: { GREETING: "hi" } });
    await t.hub.mcp.ready("fake-notes");
    const ana = await createBot(t, { name: "Ana", tools: ["*", "mcp.fake-notes.*"] });
    const dir = t.dataDir;
    await t.hub.close();
    t = await testHub({}, dir);
    expect(t.hub.tools.get("mcp.fake-notes.echo")).toBeDefined();
    const { runs } = await chat(t, ana.id, `/tool mcp.fake-notes.echo {"text":"again"}`);
    expect(results(runs[0]!)[0]!.output).toContain("hi | from-arg | again");
  });

  it("says what is wrong when the program is missing or a required value is empty", async () => {
    t = await testHub();
    t.hub.mcp.connect({ name: "Ghost", transport: "stdio", command: "orbis-no-such-program" });
    const ghost = await t.hub.mcp.ready("ghost");
    expect(ghost).toMatchObject({ status: "error", error: expect.stringContaining('"orbis-no-such-program" is not installed') });
    const missing = await t.api("POST", "/api/v1/mcp/servers", { catalogId: "github", values: {} });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields["values.token"]).toBe("required");
    expect((await t.api("POST", "/api/v1/mcp/servers", { catalogId: "nope" })).status).toBe(400);
  });
});

describe("an HTTP MCP server that asks the user to sign in", () => {
  /** An MCP endpoint behind OAuth with dynamic registration, answering initialize over server-sent events. */
  async function oauthServer() {
    const seen: { registered: unknown[]; tokenForms: URLSearchParams[]; sessions: Array<string | undefined> } = {
      registered: [],
      tokenForms: [],
      sessions: [],
    };
    const read = async (req: IncomingMessage) => {
      let raw = "";
      for await (const c of req) raw += c;
      return raw;
    };
    const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    server = createServer(async (req, res) => {
      const origin = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return json(res, 200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return json(res, 200, {
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
        });
      if (url.pathname === "/register") {
        seen.registered.push(JSON.parse(await read(req)));
        return json(res, 201, { client_id: "orbis-client-1" });
      }
      if (url.pathname === "/token") {
        const form = new URLSearchParams(await read(req));
        seen.tokenForms.push(form);
        if (form.get("code") !== "the-code") return json(res, 400, { error: "invalid_grant" });
        return json(res, 200, { access_token: "good-token", refresh_token: "r1", expires_in: 3600, token_type: "Bearer" });
      }
      if (url.pathname === "/mcp" && req.method === "POST") {
        if (req.headers.authorization !== "Bearer good-token") {
          res.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` });
          return res.end();
        }
        const msg = JSON.parse(await read(req));
        seen.sessions.push(req.headers["mcp-session-id"] as string | undefined);
        if (msg.id === undefined) {
          res.writeHead(202);
          return res.end();
        }
        if (msg.method === "initialize") {
          res.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "sess-1" });
          res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: {} })}\n\n`);
          res.end(
            `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "docs", version: "1" } } })}\n\n`,
          );
          return;
        }
        if (msg.method === "tools/list")
          return json(res, 200, {
            jsonrpc: "2.0",
            id: msg.id,
            result: { tools: [{ name: "search_pages", description: "Search pages", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }] },
          });
        if (msg.method === "tools/call")
          return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `found: ${msg.params.arguments.query}` }] } });
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/mcp`, seen };
  }

  it("registers Orbis, sends the user to sign in with PKCE, trades the code on the callback and connects", async () => {
    const fake = await oauthServer();
    t = await testHub();
    await t.hub.listen();
    t.hub.mcp.connect({ name: "Team Docs", transport: "http", url: fake.url });
    const waiting = await t.hub.mcp.ready("team-docs");
    expect(waiting.status).toBe("needs_auth");
    const auth = new URL(waiting.authUrl!);
    expect(auth.pathname).toBe("/authorize");
    expect(auth.searchParams.get("client_id")).toBe("orbis-client-1");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.get("resource")).toBe(fake.url);
    const redirect = auth.searchParams.get("redirect_uri")!;
    expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/mcp\/callback$/);
    expect(fake.seen.registered[0]).toMatchObject({ client_name: "Orbis", redirect_uris: [redirect], token_endpoint_auth_method: "none" });

    // The browser comes back without the API token: the state is the proof.
    const back = await t.hub.app.inject({ method: "GET", url: `/oauth/mcp/callback?state=${auth.searchParams.get("state")}&code=the-code` });
    expect(back.statusCode).toBe(200);
    expect(back.body).toContain("Team Docs connected");
    const form = fake.seen.tokenForms[0]!;
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const connected = t.hub.mcp.get("team-docs");
    expect(connected).toMatchObject({ status: "connected", auth: "oauth", authUrl: null });
    expect(connected.tools.map((x) => x.name)).toEqual(["mcp.team-docs.search_pages"]);
    expect(fake.seen.sessions.at(-1)).toBe("sess-1");

    const bot = await createBot(t, { name: "Rita", tools: ["*", "mcp.team-docs.*"] });
    const { runs } = await chat(t, bot.id, `/tool mcp.team-docs.search_pages {"query":"roadmap"}`);
    expect(results(runs[0]!)[0]!.output).toContain("found: roadmap");

    // A state is used once.
    const again = await t.hub.app.inject({ method: "GET", url: `/oauth/mcp/callback?state=${auth.searchParams.get("state")}&code=the-code` });
    expect(again.statusCode).toBe(400);
    expect(again.body).toContain("expired or was already used");
  });
});

describe("an HTTP MCP server whose key goes in its address", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds the key from the vault to the address it calls, and shows it nowhere", async () => {
    const KEY = "AV-FAKE-KEY-123";
    const called: string[] = [];
    let failCalls = false;
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://mcp.alphavantage.co/")) return real(input, init);
      called.push(url);
      const msg = JSON.parse(String(init?.body));
      const answer = (result: unknown) =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }), { headers: { "content-type": "application/json" } });
      if (msg.id === undefined) return new Response(null, { status: 202 });
      if (msg.method === "initialize") return answer({ protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "av", version: "1" } });
      if (msg.method === "tools/list") return answer({ tools: [{ name: "GLOBAL_QUOTE", description: "A quote", inputSchema: { type: "object" } }] });
      if (failCalls) return new Response("busy", { status: 503 });
      return answer({ content: [{ type: "text", text: `quote for ${msg.params.arguments.symbol}` }] });
    });
    t = await testHub();
    const added = await t.api("POST", "/api/v1/mcp/servers", { catalogId: "alphavantage", values: { apikey: KEY } });
    expect(added.status).toBe(202);
    const server = await t.hub.mcp.ready("alphavantage");
    expect(server).toMatchObject({ status: "connected", url: "https://mcp.alphavantage.co/mcp", logo: "/logos/mcp/alphavantage.png" });
    expect(called[0]).toBe(`https://mcp.alphavantage.co/mcp?apikey=${KEY}`);
    expect(JSON.stringify((await t.api("GET", "/api/v1/mcp/servers")).body)).not.toContain(KEY);

    const bot = await createBot(t, { name: "Fin", tools: ["*", "mcp.alphavantage.*"] });
    const ok = await chat(t, bot.id, `/tool mcp.alphavantage.GLOBAL_QUOTE {"symbol":"PETR4.SA"}`);
    expect(results(ok.runs[0]!)[0]!.output).toContain("quote for PETR4.SA");

    // An error quotes the address the user knows, without the key.
    failCalls = true;
    const failed = await chat(t, bot.id, `/tool mcp.alphavantage.GLOBAL_QUOTE {"symbol":"VALE3.SA"}`);
    const output = JSON.stringify(failed.runs[0]!.steps);
    expect(output).toContain("https://mcp.alphavantage.co/mcp answered 503");
    expect(output).not.toContain(KEY);
  });
});

describe("the marketplace", () => {
  it("has a logo file for every entry", () => {
    const logos = path.resolve(import.meta.dirname, "../../web/public");
    for (const entry of MCP_CATALOG) {
      expect(entry.logo, entry.id).toMatch(/^\/logos\/mcp\/[a-z0-9-]+\.(svg|png)$/);
      expect(existsSync(path.join(logos, entry.logo!)), entry.logo).toBe(true);
    }
  });

  it("lists every entry with how it connects, and which are connected", async () => {
    t = await testHub();
    const catalog = (await t.api("GET", "/api/v1/mcp/catalog")).body as Array<{
      id: string;
      auth: string;
      connected: string | null;
      description: { en: string; "pt-BR": string };
    }>;
    expect(catalog.map((e) => e.id)).toEqual(MCP_CATALOG.map((e) => e.id));
    expect(catalog.every((e) => e.description.en && e.description["pt-BR"] && e.connected === null)).toBe(true);
    expect(new Set(catalog.map((e) => e.auth))).toEqual(new Set(["none", "oauth", "token"]));
    expect(JSON.stringify(catalog)).not.toContain("readOnly");
    expect((await t.api("GET", "/api/v1/mcp/servers", undefined, null)).status).toBe(401);
    expect(TOKEN).toBeTruthy();
  });
});
