// specs/cloud — this hub as a device of an account (change 0066-runner-link): linked with the account's email and
// password, its own token kept in the vault, what changes here sent to the account through device_sync, the
// latest state of each row once, never a secret, and nothing more once the account revokes it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import type { DeviceStatus } from "@orbis/shared";
import { DEFAULT_SUPABASE } from "../src/config.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

const ANA = "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60";
const BIA = "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const DEVICE_TOKEN = "dvc_" + "x".repeat(43);

/** The account's cloud: sign-in, its keys, and the device functions, recording every call. */
function cloud() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = (sub = ANA) => {
    const now = Math.floor(Date.now() / 1000);
    const head = `${b64({ alg: "ES256", kid: "k1" })}.${b64({ iss: `${DEFAULT_SUPABASE.url}/auth/v1`, aud: "authenticated", role: "authenticated", sub, email: "ana@example.com", exp: now + 600 })}`;
    return `${head}.${sign("sha256", Buffer.from(head), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  const calls: Array<{ fn: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const state = { revoked: false, down: false, user: ANA };
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }] });
    if (state.down) throw new TypeError("fetch failed");
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    if (u.includes("/auth/v1/token")) {
      return body.password === "a long password"
        ? Response.json({ access_token: session(state.user), refresh_token: "r", expires_in: 3600 })
        : Response.json({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 });
    }
    const fn = u.split("/rpc/")[1]!;
    calls.push({ fn, body, headers: init.headers as Record<string, string> });
    if (fn === "register_device") return Response.json([{ id: "11111111-2222-4333-8444-555555555555", token: DEVICE_TOKEN }]);
    if (fn === "device_sync") {
      if (state.revoked) return Response.json({ code: "28000", message: "device revoked or unknown" }, { status: 401 });
      return Response.json({ upserted: (body.p_upserts as unknown[]).length, deleted: (body.p_deletes as unknown[]).length });
    }
    if (fn === "device_unlink") return Response.json(true);
    return Response.json({ message: "no such function" }, { status: 404 });
  });
  const synced = (table: string) => calls.filter((c) => c.fn === "device_sync" && c.body.p_table === table);
  return { fetchMock, session, calls, state, synced };
}

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});
const hubWith = async (c: ReturnType<typeof cloud>) => (t = await testHub({ auth: { fetch: c.fetchMock as typeof fetch }, cloud: { fetch: c.fetchMock as typeof fetch } }));
const outbox = () => (t!.hub.db.prepare("SELECT tbl, op FROM sync_outbox ORDER BY seq").all() as Array<{ tbl: string; op: string }>);
const link = (body: Record<string, unknown>) => t!.api("POST", "/api/v1/device/link", { name: "Celular da Ana", ...body });

describe("linking this hub as a device", () => {
  it("signs in, keeps the device's token in the vault only, links the account and sends everything once", async () => {
    const c = cloud();
    await hubWith(c);
    const ana = await createBot(t, { name: "Ana" });
    t.hub.secrets.vault.set(ana.id, "GITHUB_TOKEN", "ghp_never_in_the_cloud");
    // Not linked: nothing is queued.
    await createBot(t, { name: "Bia" });
    expect(outbox()).toEqual([]);

    expect((await link({ email: "ana@example.com", password: "wrong one" })).body.error.code).toBe("sign_in_failed");
    const linked = await link({ email: "ana@example.com", password: "a long password" });
    expect(linked.status).toBe(200);
    expect(linked.body as DeviceStatus).toMatchObject({ linked: { name: "Celular da Ana", ownerId: ANA, email: "ana@example.com" }, revoked: false });
    expect(JSON.stringify(linked.body)).not.toContain(DEVICE_TOKEN);
    expect(t.hub.secrets.hubSecrets.get("device.token")).toBe(DEVICE_TOKEN);
    expect(c.calls[0]).toMatchObject({ fn: "register_device", body: { p_name: "Celular da Ana" } });
    expect(c.calls[0]!.headers.authorization).toMatch(/^Bearer ey/);
    expect(((await t.api("GET", "/api/v1/account")).body as { linked: { userId: string } }).linked.userId).toBe(ANA);

    await t.hub.sync.tick();
    const bots = c.synced("bots");
    expect(bots).toHaveLength(1);
    expect(bots[0]!.body.p_token).toBe(DEVICE_TOKEN);
    expect(bots[0]!.headers.authorization).toBeUndefined();
    expect((bots[0]!.body.p_upserts as Array<{ name: string; brain: unknown }>).map((b) => b.name).sort()).toEqual(["Ana", "Bia"]);
    expect(typeof (bots[0]!.body.p_upserts as Array<{ brain: unknown }>)[0]!.brain).toBe("object");
    // Never a secret, the device's own settings or the vault.
    const everything = JSON.stringify(c.calls.filter((x) => x.fn === "device_sync").map((x) => x.body.p_upserts));
    for (const never of ["ghp_never_in_the_cloud", DEVICE_TOKEN, "secret:", '"key":"device"', '"key":"sync.on"', '"key":"account"']) expect(everything).not.toContain(never);
    expect(outbox()).toEqual([]);
    expect((await t.api("GET", "/api/v1/device")).body).toMatchObject({ pending: 0, lastError: null, lastSyncAt: expect.any(String) });
  });

  it("sends each change once with the row's latest state, deletions by key, and in the order of references", async () => {
    const c = cloud();
    await hubWith(c);
    await link({ email: "ana@example.com", password: "a long password" });
    await t.hub.sync.tick();
    c.calls.length = 0;

    const ana = await createBot(t, { name: "Ana" });
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { description: "first" });
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { description: "second" });
    await t.api("GET", `/api/v1/bots/${ana.id}/conversation`);
    const bia = await createBot(t, { name: "Bia" });
    await t.api("DELETE", `/api/v1/bots/${bia.id}`);
    expect(outbox().filter((e) => e.tbl === "bots").length).toBeGreaterThan(3);

    await t.hub.sync.tick();
    const bots = c.synced("bots");
    expect(bots).toHaveLength(1);
    const upserts = bots[0]!.body.p_upserts as Array<{ id: string; description: string }>;
    expect(upserts).toEqual([expect.objectContaining({ id: ana.id, description: "second" })]);
    expect(bots[0]!.body.p_deletes).toEqual([{ id: bia.id }]);
    // A bot's conversation goes after the bot it points at.
    const order = c.calls.map((x) => x.body.p_table);
    expect(order.indexOf("bots")).toBeLessThan(order.indexOf("conversations"));
    expect(outbox()).toEqual([]);
  });

  it("keeps what waits while the cloud is down, and stops for good once the account revokes the device", async () => {
    const c = cloud();
    await hubWith(c);
    await link({ email: "ana@example.com", password: "a long password" });
    await t.hub.sync.tick();
    c.state.down = true;
    await createBot(t, { name: "Ana" });
    await t.hub.sync.tick();
    const waiting = (await t.api("GET", "/api/v1/device")).body as DeviceStatus;
    expect(waiting.pending).toBeGreaterThan(0);
    expect(waiting.lastError).toMatch(/cannot be reached/);

    c.state.down = false;
    c.state.revoked = true;
    await t.api("POST", "/api/v1/device/sync");
    const revoked = (await t.api("GET", "/api/v1/device")).body as DeviceStatus;
    expect(revoked).toMatchObject({ revoked: true, pending: 0, lastError: "the account revoked this device" });
    expect(t.hub.secrets.hubSecrets.get("device.token")).toBeNull();
    await createBot(t, { name: "Bia" });
    expect(outbox()).toEqual([]);
  });

  it("refuses another account, a second link, and a session alone; unlinking leaves nothing behind", async () => {
    const c = cloud();
    await hubWith(c);
    await t.api("POST", "/api/v1/account/link", { accessToken: c.session(BIA) });
    expect((await link({ email: "ana@example.com", password: "a long password" })).body.error.code).toBe("other_account");
    await t.api("DELETE", "/api/v1/account");

    expect((await link({ accessToken: c.session() })).status).toBe(200);
    expect((await link({ accessToken: c.session() })).body.error.code).toBe("already_linked");
    // An account session opens the hub but never manages its device link.
    expect((await t.api("DELETE", "/api/v1/device", undefined, c.session())).body.error.code).toBe("token_required");

    const gone = (await t.api("DELETE", "/api/v1/device")).body as DeviceStatus;
    expect(gone).toMatchObject({ linked: null, pending: 0, revoked: false });
    expect(c.calls.at(-1)).toMatchObject({ fn: "device_unlink", body: { p_token: DEVICE_TOKEN } });
    expect(t.hub.secrets.hubSecrets.get("device.token")).toBeNull();
    await createBot(t, { name: "Ana" });
    expect(outbox()).toEqual([]);
  });

  it("revokes the device it just registered when this hub cannot keep it, so none stays unused in the account", async () => {
    const c = cloud();
    await hubWith(c);
    const setLinked = vi.spyOn(t.hub.auth, "setLinked").mockImplementation(() => {
      throw new Error("disk full");
    });
    const failed = await link({ email: "ana@example.com", password: "a long password" });
    expect(failed.status).toBe(500);
    expect(c.calls.map((x) => x.fn)).toEqual(["register_device", "device_unlink"]);
    expect(c.calls[1]!.body).toEqual({ p_token: DEVICE_TOKEN });
    expect(t.hub.secrets.hubSecrets.get("device.token")).toBeNull();
    expect(((await t.api("GET", "/api/v1/device")).body as DeviceStatus).linked).toBeNull();
    // Linking again works once the hub can keep it.
    setLinked.mockRestore();
    expect((await link({ email: "ana@example.com", password: "a long password" })).status).toBe(200);
  });

  it("the device's link and token never go into an export", async () => {
    const c = cloud();
    await hubWith(c);
    await link({ email: "ana@example.com", password: "a long password" });
    const res = await t.hub.app.inject({ method: "POST", url: "/api/v1/export", headers: { authorization: "Bearer test-token" }, payload: { password: "a long export password" } });
    const { readZip } = await import("../src/export/zip.js");
    const parts = new Map(readZip(res.rawPayload).map((e) => [e.path, e.data.toString()]));
    expect(parts.get("tables/settings.jsonl") ?? "").not.toMatch(/"key":"(device|sync\.on|account)"/);
    const { unseal } = await import("../src/export/seal.js");
    const sealed = unseal<{ hub: Array<{ name: string }> }>(JSON.parse(parts.get("secrets.sealed.json")!), "a long export password");
    expect(sealed.hub.map((s) => s.name)).not.toContain("device.token");
  });
});
