// specs/tool-gateway — the marketing servers of the MCP catalog (change 0056-marketing-mcp-catalog): what each
// entry connects to, and Orbis's sign-in finding Meta's and TikTok's authorization servers from the metadata
// they published when the entries were checked (recorded on 2026-10-04). Change 0058-instagram-adelaidasofia:
// Instagram through adelaidasofia/instagram-mcp, the reads a catalog entry names running without asking, and a
// connection that still starts the program an entry no longer runs.
import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import type { McpCatalogEntry } from "@orbis/shared";
import { MCP_CATALOG } from "../src/mcp/catalog.js";
import { authorizationUrl, discover, register } from "../src/mcp/oauth.js";
import { defaultDecisionOf } from "../src/tools/registry.js";
import { createBot, FIXTURES, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
const added: string[] = [];
afterEach(async () => {
  await t?.cleanup();
  t = null;
  for (const id of added.splice(0)) MCP_CATALOG.splice(MCP_CATALOG.findIndex((e) => e.id === id), 1);
});

const entry = (id: string) => MCP_CATALOG.find((e) => e.id === id);

/** A fetch that answers only the recorded addresses; anything else is a 404, as the real servers answer. */
function recorded(pages: Record<string, unknown>, registered: Array<{ url: string; body: unknown }>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      registered.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ client_id: "orbis-client" }), { status: 201, headers: { "content-type": "application/json" } });
    }
    const page = pages[url];
    return page ? new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } }) : new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}

describe("the marketing servers of the catalog", () => {
  it("lists Meta Ads, TikTok Ads, Google Analytics and Instagram under Marketing, and no LinkedIn", () => {
    expect(MCP_CATALOG.filter((e) => e.category === "marketing").map((e) => e.id)).toEqual(["meta-ads", "tiktok-ads", "google-analytics", "instagram"]);
    expect(MCP_CATALOG.some((e) => /linkedin/i.test(e.id + e.name))).toBe(false);
    // The platforms' own hosted servers, signed in with the user's account.
    expect(entry("meta-ads")).toMatchObject({ transport: "http", url: "https://mcp.facebook.com/ads", auth: "oauth", fields: [] });
    expect(entry("meta-ads")).not.toHaveProperty("readOnly");
    // TikTok's progressive endpoint: ~40 tools up front, not ~400 in every bot's context.
    expect(entry("tiktok-ads")).toMatchObject({ transport: "http", url: "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer", auth: "oauth" });
    // Google's own server, read-only by its scope, started with pipx and its credentials file.
    expect(entry("google-analytics")).toMatchObject({ transport: "stdio", command: "pipx", args: ["run", "analytics-mcp"], readOnly: true, needs: "Python (pipx)" });
    expect(entry("google-analytics")!.fields.map((f) => [f.key, f.target])).toEqual([
      ["GOOGLE_APPLICATION_CREDENTIALS", "env"],
      ["GOOGLE_PROJECT_ID", "env"],
    ]);
    // adelaidasofia/instagram-mcp from PyPI, pinned to the version whose code was read; its token and app secret secret.
    const instagram = entry("instagram")!;
    expect(instagram).toMatchObject({
      transport: "stdio",
      command: "pipx",
      args: ["run", "--spec", "adelaidasofia-instagram-mcp==0.1.2", "instagram-mcp"],
      homepage: "https://github.com/adelaidasofia/instagram-mcp",
      needs: "Python (pipx)",
    });
    expect(instagram).not.toHaveProperty("readOnly");
    expect(instagram.fields.map((f) => [f.key, f.secret, f.optional ?? false])).toEqual([
      ["INSTAGRAM_MCP_ACCESS_TOKEN", true, false],
      ["INSTAGRAM_MCP_IG_USER_ID", false, false],
      ["INSTAGRAM_MCP_APP_SECRET", true, true],
    ]);
    // Its reads run without asking; publishing, comments and DMs ask first.
    expect(instagram.readOnlyTools).toEqual(expect.arrayContaining(["get_account_insights", "get_media_insights", "list_media", "get_comments", "business_discovery"]));
    for (const writes of ["add_account", "publish_image", "publish_reel", "reply_to_comment", "delete_comment", "send_message", "get_messages"]) {
      expect(instagram.readOnlyTools, writes).not.toContain(writes);
    }
    expect(JSON.stringify(MCP_CATALOG)).not.toContain("@mcpware/instagram-mcp");
    for (const e of MCP_CATALOG.filter((x) => x.category === "marketing")) {
      expect(e.description.en, e.id).toBeTruthy();
      expect(e.description["pt-BR"], e.id).toBeTruthy();
    }
  });

  it("signs in to Meta Ads: its resource metadata, its authorization server and a registration of its own", async () => {
    const registered: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = recorded(
      {
        "https://mcp.facebook.com/.well-known/oauth-protected-resource/ads": {
          resource: "https://mcp.facebook.com/ads",
          authorization_servers: ["https://www.facebook.com/ads"],
          scopes_supported: ["ads_management", "ads_read"],
          bearer_methods_supported: ["header"],
        },
        "https://www.facebook.com/.well-known/oauth-authorization-server/ads": {
          issuer: "https://www.facebook.com/ads",
          authorization_endpoint: "https://www.facebook.com/v26.0/dialog/oauth",
          token_endpoint: "https://graph.facebook.com/v26.0/oauth/access_token",
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          registration_endpoint: "https://mcp.facebook.com/.well-known/register/ads",
        },
      },
      registered,
    );
    const challenge =
      'Bearer resource_metadata="https://mcp.facebook.com/.well-known/oauth-protected-resource/ads", scope="ads_management ads_read instagram_basic"';
    const found = await discover("https://mcp.facebook.com/ads", challenge, fetchImpl);
    expect(found).toMatchObject({ resource: "https://mcp.facebook.com/ads", scope: "ads_management ads_read instagram_basic" });
    expect(found.metadata.token_endpoint).toBe("https://graph.facebook.com/v26.0/oauth/access_token");
    const client = await register(found.metadata, "http://127.0.0.1:7420/oauth/mcp/callback", fetchImpl);
    expect(registered[0]).toMatchObject({ url: "https://mcp.facebook.com/.well-known/register/ads", body: { token_endpoint_auth_method: "none" } });
    const signIn = new URL(authorizationUrl(found.metadata, client, { redirectUri: "http://127.0.0.1:7420/oauth/mcp/callback", state: "s", challenge: "c", ...found }));
    expect(signIn.origin + signIn.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(signIn.searchParams.get("resource")).toBe("https://mcp.facebook.com/ads");
  });

  it("signs in to TikTok Ads, whose authorization server publishes its metadata under its own path", async () => {
    const registered: Array<{ url: string; body: unknown }> = [];
    const issuer = "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth";
    const fetchImpl = recorded(
      {
        "https://business-api.tiktok.com/.well-known/oauth-protected-resource/open_mcp/tt-ads-mcp-layer": {
          authorization_servers: [issuer],
          bearer_methods_supported: ["header"],
          resource: "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer",
          scopes_supported: ["mcp:tt4b"],
        },
        // Only here: not under /.well-known/oauth-authorization-server/<path>.
        [`${issuer}/.well-known/openid-configuration`]: {
          issuer,
          authorization_endpoint: "https://business-api.tiktok.com/portal/mcp-tt4b-authorize",
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        },
      },
      registered,
    );
    const challenge = 'Bearer resource_metadata="https://business-api.tiktok.com/.well-known/oauth-protected-resource/open_mcp/tt-ads-mcp-layer"';
    const found = await discover("https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer", challenge, fetchImpl);
    expect(found).toMatchObject({ resource: "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer", scope: "mcp:tt4b" });
    expect(found.metadata.authorization_endpoint).toBe("https://business-api.tiktok.com/portal/mcp-tt4b-authorize");
    await register(found.metadata, "http://127.0.0.1:7420/oauth/mcp/callback", fetchImpl);
    expect(registered.map((r) => r.url)).toEqual([`${issuer}/register`]);
  });
});

describe("a catalog server that does not mark its reads", () => {
  function fakeEntry(): McpCatalogEntry {
    // The fake program marks `echo` read-only itself; `create_note` it does not, and the entry names it a read.
    const test: McpCatalogEntry = {
      id: "social-fake",
      name: "Social Fake",
      icon: "📸",
      category: "marketing",
      description: { en: "test", "pt-BR": "teste" },
      transport: "stdio",
      command: process.execPath,
      args: [path.join(FIXTURES, "fake-mcp-server.mjs"), "v1"],
      auth: "none",
      fields: [],
      readOnlyTools: ["create_note"],
      homepage: "https://example.com",
    };
    MCP_CATALOG.push(test);
    added.push(test.id);
    return test;
  }

  it("runs the tools the entry names as reads without asking", async () => {
    fakeEntry();
    t = await testHub();
    expect((await t.api("POST", "/api/v1/mcp/servers", { catalogId: "social-fake", values: {} })).status).toBe(202);
    const ready = await t.hub.mcp.ready("social-fake");
    expect(ready.tools.map((x) => [x.remoteName, x.readOnly])).toEqual([
      ["echo", true],
      ["create_note", true],
    ]);
    const bot = await createBot(t, { name: "Lia", tools: ["*", "mcp.social-fake.*"] });
    const tool = t.hub.tools.get("mcp.social-fake.create_note")!;
    expect(tool.risk).toBe("read");
    expect(defaultDecisionOf(tool, t.hub.botService.get(bot.id))).toBe("allow");
  });

  it("stops a connection that still starts the program the entry no longer runs, until it is connected again", async () => {
    const test = fakeEntry();
    t = await testHub();
    await t.api("POST", "/api/v1/mcp/servers", { catalogId: "social-fake", values: {} });
    expect(await t.hub.mcp.ready("social-fake")).toMatchObject({ status: "connected" });
    const dir = t.dataDir;
    await t.hub.close();

    // The catalog now runs another program (a server replaced, another pinned version).
    test.args = [path.join(FIXTURES, "fake-mcp-server.mjs"), "v2"];
    t = await testHub({}, dir);
    const stale = t.hub.mcp.get("social-fake");
    expect(stale).toMatchObject({ status: "error", error: expect.stringContaining("disconnect it and connect it again"), tools: [] });
    expect(t.hub.tools.get("mcp.social-fake.echo")).toBeUndefined();
    t.hub.mcp.reconnect("social-fake");
    expect(await t.hub.mcp.ready("social-fake")).toMatchObject({ status: "error", args: [expect.any(String), "v1"] });

    // Connected again, it starts what the catalog runs now.
    await t.hub.mcp.remove("social-fake");
    await t.api("POST", "/api/v1/mcp/servers", { catalogId: "social-fake", values: {} });
    expect(await t.hub.mcp.ready("social-fake")).toMatchObject({ status: "connected", args: [expect.any(String), "v2"] });
  });
});
