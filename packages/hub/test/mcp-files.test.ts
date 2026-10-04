// specs/tool-gateway — files in the cloud (change 0057-google-drive-onedrive-mcp): the Google Drive and OneDrive
// entries, and Orbis signing in for a program that cannot sign in by itself — with the user's own OAuth client,
// before the program starts, the tokens handed to it in its environment and refreshed when they expire.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { McpCatalogEntry, Run } from "@orbis/shared";
import { MCP_CATALOG } from "../src/mcp/catalog.js";
import { chat, createBot, FIXTURES, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
const added: string[] = [];
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  for (const id of added.splice(0)) MCP_CATALOG.splice(MCP_CATALOG.findIndex((e) => e.id === id), 1);
});

const entry = (id: string) => MCP_CATALOG.find((e) => e.id === id);
const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result") as Array<{ output: string; isError: boolean }>;

describe("the files-in-the-cloud entries", () => {
  it("signs in to Google Drive through Orbis with the user's own client, and to OneDrive with a code", () => {
    const drive = entry("google-drive")!;
    expect(drive).toMatchObject({ category: "files", transport: "stdio", command: "npx", args: ["-y", "@piotr-agier/google-drive-mcp@2.12.0"], auth: "oauth" });
    expect(drive.fields.map((f) => [f.key, f.target, f.secret])).toEqual([
      ["client_id", "client_id", false],
      ["client_secret", "client_secret", true],
    ]);
    expect(drive.oauth).toMatchObject({
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
      params: { access_type: "offline", prompt: "consent" },
      env: {
        accessToken: "GOOGLE_DRIVE_MCP_ACCESS_TOKEN",
        refreshToken: "GOOGLE_DRIVE_MCP_REFRESH_TOKEN",
        clientId: "GOOGLE_DRIVE_MCP_CLIENT_ID",
        clientSecret: "GOOGLE_DRIVE_MCP_CLIENT_SECRET",
      },
    });
    // Only OneDrive's tools of Microsoft 365, signed in by the program with a device code.
    expect(entry("onedrive")).toMatchObject({
      category: "files",
      transport: "stdio",
      args: ["-y", "@softeria/ms-365-mcp-server@0.158.0", "--preset", "onedrive"],
      auth: "device",
      fields: [],
    });
  });
});

describe("Orbis signing in for a program", () => {
  async function provider() {
    const seen = { forms: [] as URLSearchParams[] };
    server = createServer(async (req, res) => {
      const form = new URLSearchParams(await read(req));
      seen.forms.push(form);
      const tokens =
        form.get("grant_type") === "authorization_code"
          ? // About to expire: Orbis refreshes it before starting the program.
            { access_token: "at-1", refresh_token: "rt-1", expires_in: 30, token_type: "Bearer" }
          : { access_token: "at-2", expires_in: 3600, token_type: "Bearer" };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(tokens));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const origin = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    const test: McpCatalogEntry = {
      id: "cloud-files",
      name: "Cloud Files",
      icon: "🗂️",
      category: "files",
      description: { en: "test", "pt-BR": "teste" },
      transport: "stdio",
      command: process.execPath,
      args: [path.join(FIXTURES, "fake-mcp-server.mjs"), "from-arg"],
      auth: "oauth",
      fields: [
        { key: "client_id", label: { en: "Client ID", "pt-BR": "ID" }, secret: false, target: "client_id" },
        { key: "client_secret", label: { en: "Client secret", "pt-BR": "Segredo" }, secret: true, target: "client_secret" },
      ],
      // The fake program says GREETING back: here, the access token it received.
      oauth: { authorizationEndpoint: `${origin}/auth`, tokenEndpoint: `${origin}/token`, scope: "files.read", params: { access_type: "offline" }, env: { accessToken: "GREETING", clientId: "CLIENT_ID" } },
      homepage: "https://example.com",
    };
    MCP_CATALOG.push(test);
    added.push(test.id);
    return seen;
  }

  it("asks the user to sign in before starting it, then starts it with the tokens, refreshed when they expire", async () => {
    const seen = await provider();
    t = await testHub();
    await t.hub.listen();
    const posted = await t.api("POST", "/api/v1/mcp/servers", { catalogId: "cloud-files", values: { client_id: "my-client", client_secret: "my-secret" } });
    expect(posted.status).toBe(202);

    // Not started yet: the user signs in first, with their own client and the entry's scope and parameters.
    const waiting = await t.hub.mcp.ready("cloud-files");
    expect(waiting).toMatchObject({ status: "needs_auth", tools: [] });
    const auth = new URL(waiting.authUrl!);
    expect(auth.pathname).toBe("/auth");
    expect(auth.searchParams.get("client_id")).toBe("my-client");
    expect(auth.searchParams.get("scope")).toBe("files.read");
    expect(auth.searchParams.get("access_type")).toBe("offline");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.has("resource")).toBe(false);
    expect(JSON.stringify(t.hub.mcp.list())).not.toContain("my-secret");

    const back = await t.hub.app.inject({ method: "GET", url: `/oauth/mcp/callback?state=${auth.searchParams.get("state")}&code=the-code` });
    expect(back.statusCode).toBe(200);
    const [exchange, refresh] = seen.forms;
    expect(exchange!.get("grant_type")).toBe("authorization_code");
    expect(exchange!.get("client_secret")).toBe("my-secret");
    expect(exchange!.has("resource")).toBe(false);
    expect(refresh!.get("grant_type")).toBe("refresh_token");
    expect(refresh!.get("refresh_token")).toBe("rt-1");

    const connected = await t.hub.mcp.ready("cloud-files");
    expect(connected).toMatchObject({ status: "connected", authUrl: null });
    const bot = await createBot(t, { name: "Rita", tools: ["*", "mcp.cloud-files.*"] });
    const { runs } = await chat(t, bot.id, `/tool mcp.cloud-files.echo {"text":"oi"}`);
    // The program received the refreshed token in its environment.
    expect(results(runs[0]!)[0]!.output).toContain("at-2 | from-arg | oi");

    // Disconnecting forgets the client and the sign-in.
    await t.hub.mcp.remove("cloud-files");
    const kept = ["oauth", "client_id", "client_secret"].filter((what) => t!.hub.secrets.hubSecrets.has(`mcp.cloud-files.${what}`));
    expect(kept).toEqual([]);
  });

  it("refuses to sign in without the user's own client", async () => {
    await provider();
    t = await testHub();
    await t.hub.listen();
    const posted = await t.api("POST", "/api/v1/mcp/servers", { catalogId: "cloud-files", values: { client_id: "", client_secret: "" } });
    expect(posted.status).toBe(400);
    expect(posted.body.error.message).toMatch(/Client ID is required/);
  });
});
