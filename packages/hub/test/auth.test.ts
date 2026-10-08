// specs/hub-api — signing in to the hub (change 0064-account-sign-in): the hub's token, or the session of
// the one account linked to it, checked against the Supabase project's public keys; nothing else opens it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { AccountStatus, AuthConfig } from "@orbis/shared";
import { AccountTokens, InvalidSession } from "../src/auth/jwt.js";
import { FAILURES_PER_MINUTE } from "../src/auth/account.js";
import { DEFAULT_SUPABASE, loadConfig } from "../src/config.js";
import { testHub, TOKEN, type TestHub } from "./helpers.js";

const ISSUER = `${DEFAULT_SUPABASE.url}/auth/v1`;
const ANA = "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60";
const BIA = "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

/** A Supabase project: its signing keys, its published key set, and the sessions it signs. */
function project() {
  const keys = new Map<string, KeyObject>();
  const published: object[] = [];
  const addKey = (kid: string) => {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    keys.set(kid, pair.privateKey);
    published.push({ ...pair.publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" });
  };
  addKey("k1");
  const fetch = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(`${ISSUER}/.well-known/jwks.json`);
    return new Response(JSON.stringify({ keys: published }), { headers: { "content-type": "application/json" } });
  });
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = (over: Record<string, unknown> = {}, opts: { kid?: string; alg?: string; key?: KeyObject } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "k1", typ: "JWT" });
    const payload = b64({ iss: ISSUER, aud: "authenticated", role: "authenticated", sub: ANA, email: "ana@example.com", iat: now, exp: now + 3600, ...over });
    const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key: opts.key ?? keys.get(opts.kid ?? "k1")!, dsaEncoding: "ieee-p1363" });
    return `${header}.${payload}.${signature.toString("base64url")}`;
  };
  return { fetch, session, addKey };
}

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("an account's session", () => {
  it("holds only when signed by the project's key, from the project, for a signed-in account, in time", async () => {
    const p = project();
    const tokens = new AccountTokens(DEFAULT_SUPABASE.url, p.fetch as typeof fetch);
    expect(await tokens.verify(p.session())).toEqual({ userId: ANA, email: "ana@example.com", exp: expect.any(Number) });

    const refused = async (token: string) => expect(tokens.verify(token)).rejects.toBeInstanceOf(InvalidSession);
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    await refused(p.session({}, { key: other }));
    await refused(p.session({ iss: "https://evil.supabase.co/auth/v1" }));
    await refused(p.session({ exp: Math.floor(Date.now() / 1000) - 120 }));
    await refused(p.session({ role: "anon" }));
    await refused(p.session({ is_anonymous: true }));
    await refused(p.session({ aud: "service" }));
    await refused(p.session({ sub: "not-a-uuid" }));
    // Never unsigned, never a shared-secret signature.
    const [, payload] = p.session().split(".");
    await refused(`${Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url")}.${payload}.`);
    await refused(p.session({}, { alg: "HS256" }));
    await refused("not.a.jwt!");
    // The key set is fetched once and kept.
    expect(p.fetch).toHaveBeenCalledTimes(1);
  });

  it("follows a key rotation: a new key id fetches the keys again", async () => {
    const p = project();
    let now = Date.now();
    const tokens = new AccountTokens(DEFAULT_SUPABASE.url, p.fetch as typeof fetch, () => now);
    await tokens.verify(p.session());
    p.addKey("k2");
    now += 31_000;
    expect((await tokens.verify(p.session({}, { kid: "k2" }))).userId).toBe(ANA);
    expect(p.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("signing in to the hub", () => {
  it("opens with the token, and with the linked account's session once the token linked it", async () => {
    const p = project();
    t = await testHub({ auth: { fetch: p.fetch as typeof fetch } });
    const config = await t.api("GET", "/api/v1/auth/config", undefined, "");
    expect(config.status).toBe(200);
    expect(config.body as AuthConfig).toEqual({ supabase: DEFAULT_SUPABASE, linked: false });

    // Before it is linked, no account opens the hub.
    const ana = p.session();
    expect((await t.api("GET", "/api/v1/bots", undefined, ana)).status).toBe(401);

    const linked = await t.api("POST", "/api/v1/account/link", { accessToken: ana });
    expect(linked.status).toBe(200);
    expect(linked.body as AccountStatus).toMatchObject({ available: true, linked: { userId: ANA, email: "ana@example.com" }, via: "token" });
    expect(((await t.api("GET", "/api/v1/auth/config", undefined, "")).body as AuthConfig).linked).toBe(true);

    expect((await t.api("GET", "/api/v1/bots", undefined, ana)).status).toBe(200);
    expect(((await t.api("GET", "/api/v1/account", undefined, ana)).body as AccountStatus).via).toBe("account");
    // Another account, a session alone linking, a broken session: refused.
    expect((await t.api("GET", "/api/v1/bots", undefined, p.session({ sub: BIA, email: "bia@example.com" }))).status).toBe(401);
    expect((await t.api("POST", "/api/v1/account/link", { accessToken: p.session({ sub: BIA }) }, ana)).body.error.code).toBe("token_required");
    expect((await t.api("POST", "/api/v1/account/link", { accessToken: p.session({ exp: 1 }) })).body.error.code).toBe("invalid_session");

    // A stream ticket asked with the session, and the file key.
    expect((await t.api("POST", "/api/v1/stream/ticket", undefined, ana)).body.ticket).toMatch(/^a_/);
    expect((await t.api("POST", "/api/v1/files/key", undefined, ana)).body.key).toMatch(/^[0-9a-z]+\./);

    // Unlinked, the session stops working; the token still does.
    expect(((await t.api("DELETE", "/api/v1/account", undefined, ana)).body as AccountStatus).linked).toBeNull();
    expect((await t.api("GET", "/api/v1/bots", undefined, ana)).status).toBe(401);
    expect((await t.api("GET", "/api/v1/bots")).status).toBe(200);
  });

  it("makes an address that keeps failing wait a minute, and still lets the owner in", async () => {
    let now = Date.now();
    t = await testHub({ auth: { now: () => now } });
    for (let i = 0; i < FAILURES_PER_MINUTE; i++) expect((await t.api("GET", "/api/v1/bots", undefined, `wrong-${i}`)).status).toBe(401);
    const busy = await t.api("GET", "/api/v1/bots", undefined, "wrong-again");
    expect(busy.status).toBe(429);
    expect(busy.body.error.code).toBe("too_many_failures");
    // Behind a tunnel every visitor has the same address: a stranger's tries never lock the owner out.
    expect((await t.api("GET", "/api/v1/bots")).status).toBe(200);
    now += 61_000;
    expect((await t.api("GET", "/api/v1/bots", undefined, "wrong-later")).status).toBe(401);
  });

  it("has no account sign-in when ORBIS_SUPABASE_URL is off, and refuses a bad project address", async () => {
    t = await testHub({ env: { ORBIS_SUPABASE_URL: "off" } });
    expect(((await t.api("GET", "/api/v1/auth/config", undefined, "")).body as AuthConfig).supabase).toBeNull();
    expect((await t.api("POST", "/api/v1/account/link", { accessToken: "a".repeat(40) })).body.error.code).toBe("accounts_off");
    expect(() => loadConfig({ ORBIS_SUPABASE_URL: "http://plain.example.com", ORBIS_SUPABASE_KEY: "k" }, { dataDir: t!.dataDir, token: TOKEN })).toThrow(/https/);
    expect(() => loadConfig({ ORBIS_SUPABASE_URL: "https://x.supabase.co" }, { dataDir: t!.dataDir, token: TOKEN })).toThrow(/ORBIS_SUPABASE_KEY/);
  });
});
