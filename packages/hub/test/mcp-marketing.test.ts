// specs/tool-gateway — the marketing servers of the MCP catalog (change 0056-marketing-mcp-catalog): what each
// entry connects to, and Orbis's sign-in finding Meta's and TikTok's authorization servers from the metadata
// they published when the entries were checked (recorded on 2026-10-04).
import { describe, expect, it } from "vitest";
import { MCP_CATALOG } from "../src/mcp/catalog.js";
import { authorizationUrl, discover, register } from "../src/mcp/oauth.js";

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
    // A community server that can post and send DMs: pinned to the version that was read, its token secret.
    const instagram = entry("instagram")!;
    expect(instagram).toMatchObject({ transport: "stdio", command: "npx", args: ["-y", "@mcpware/instagram-mcp@1.0.4"] });
    expect(instagram).not.toHaveProperty("readOnly");
    expect(instagram.fields.map((f) => [f.key, f.secret])).toEqual([
      ["INSTAGRAM_ACCESS_TOKEN", true],
      ["INSTAGRAM_ACCOUNT_ID", false],
    ]);
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
