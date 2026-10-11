// specs/cloud — the Orbis cloud (change 0068-cloud-relay): the Worker serves the web app with its security
// headers, checks a browser's session and a hub's device token before anything reaches an account, and the
// account's Durable Object relays requests and streams to the one hub connected, or says the phone is off.
import { describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bodyFrames, BodyCollector, parseFrame, RELAY_CHUNK_BYTES, RELAY_REPLACED, type RelayFrame } from "@orbis/shared";
import { handle, type Env } from "../src/worker.js";
import { Account, RELAY_RENEW_MS, type Platform, type Socket, type State } from "../src/account.js";
import { THEME_SCRIPT_HASH } from "../src/security.js";

const PROJECT = "https://proj.supabase.co";
const ANA = "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60";
const BIA = "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const DEVICE = "dvc_" + "z".repeat(43);

function supabase() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = (claims: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const head = `${b64({ alg: "ES256", kid: "k1" })}.${b64({ iss: `${PROJECT}/auth/v1`, aud: "authenticated", role: "authenticated", sub: ANA, exp: now + 600, ...claims })}`;
    return `${head}.${sign("sha256", Buffer.from(head), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  const state = { revoked: false };
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }] });
    if (u.endsWith("/rpc/device_identity")) {
      const body = JSON.parse(String(init.body)) as { p_token: string };
      if (state.revoked || body.p_token !== DEVICE) return Response.json({ code: "28000", message: "device revoked or unknown" }, { status: 401 });
      return Response.json([{ owner_id: ANA, device_id: "11111111-2222-4333-8444-555555555555" }]);
    }
    return new Response("no", { status: 404 });
  });
  return { session, fetchMock, state };
}

/** The Worker's bindings, recording what reaches each account's object. */
function env() {
  const reached: Array<{ account: string; req: Request }> = [];
  const e: Env = {
    SUPABASE_URL: PROJECT,
    SUPABASE_KEY: "sb_publishable_x",
    ASSETS: { fetch: async () => new Response("<!doctype html><title>Orbis</title>", { headers: { "content-type": "text/html" } }) },
    ACCOUNT: {
      idFromName: (name: string) => name,
      get: (id: unknown) => ({
        fetch: async (req: Request) => {
          reached.push({ account: String(id), req });
          const p = req.headers.get("x-orbis-path") ?? "";
          if (p === "/api/v1/stream/ticket") return Response.json({ ticket: "a_ticket123456", expiresAt: "x" });
          if (p === "/api/v1/files/key") return Response.json({ key: "abc.def12345", expiresAt: "x" });
          return Response.json({ ok: true, path: p });
        },
      }),
    },
  };
  return { e, reached };
}

describe("the cloud's Worker", () => {
  it("serves the app with its security headers, and says where accounts sign in", async () => {
    const { e } = env();
    const page = await handle(new Request("https://orbis.example/"), e);
    expect(await page.text()).toContain("Orbis");
    expect(page.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = page.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`connect-src 'self' ${PROJECT}`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    const config = await handle(new Request("https://orbis.example/api/v1/auth/config"), e);
    expect(await config.json()).toEqual({ supabase: { url: PROJECT, key: "sb_publishable_x" }, linked: true });
  });

  it("lets the web app's one inline script run, and nothing else inline", () => {
    const html = readFileSync(path.resolve(import.meta.dirname, "../../web/index.html"), "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `sha256-${createHash("sha256").update(m[1]!).digest("base64")}`);
    expect(scripts).toEqual([THEME_SCRIPT_HASH]);
  });

  it("relays the API only with a session of the account it names, and never the cloud's own headers", async () => {
    const sb = supabase();
    const { e, reached } = env();
    const deps = { fetch: sb.fetchMock as typeof fetch };
    expect((await handle(new Request("https://orbis.example/api/v1/bots"), e, deps)).status).toBe(401);
    for (const bad of [sb.session({ iss: "https://evil.supabase.co/auth/v1" }), sb.session({ exp: 1 }), sb.session({ role: "anon" }), sb.session({ is_anonymous: true }), "not.a.jwt"]) {
      expect((await handle(new Request("https://orbis.example/api/v1/bots", { headers: { authorization: `Bearer ${bad}` } }), e, deps)).status).toBe(401);
    }
    // A token signed by another key.
    const other = supabase().session();
    expect((await handle(new Request("https://orbis.example/api/v1/bots", { headers: { authorization: `Bearer ${other}` } }), e, deps)).status).toBe(401);
    expect(reached).toHaveLength(0);

    const res = await handle(
      new Request("https://orbis.example/api/v1/bots?x=1", {
        method: "POST",
        headers: { authorization: `Bearer ${sb.session()}`, cookie: "a=b", "cf-connecting-ip": "203.0.113.7", "x-orbis-kind": "runner", "content-type": "application/json" },
        body: '{"name":"Ana"}',
      }),
      e,
      deps,
    );
    expect(res.status).toBe(200);
    expect(reached).toHaveLength(1);
    const got = reached[0]!;
    expect(got.account).toBe(ANA);
    expect(got.req.headers.get("x-orbis-path")).toBe("/api/v1/bots?x=1");
    expect(got.req.headers.get("x-orbis-kind")).toBe("http");
    expect(got.req.headers.get("x-orbis-ip")).toBe("203.0.113.7");
    expect(got.req.headers.get("cookie")).toBeNull();
    expect(got.req.headers.get("authorization")).toMatch(/^Bearer ey/);
    expect(await got.req.text()).toBe('{"name":"Ana"}');
  });

  it("keeps the hub's own links, pairing and account unlinking off the cloud", async () => {
    const sb = supabase();
    const { e, reached } = env();
    const auth = { authorization: `Bearer ${sb.session()}` };
    for (const [method, p] of [
      ["POST", "/api/v1/pairing/claim"],
      ["POST", "/api/v1/device/link"],
      ["DELETE", "/api/v1/device"],
      ["POST", "/api/v1/account/link"],
      ["DELETE", "/api/v1/account"],
    ] as const) {
      const res = await handle(new Request(`https://orbis.example${p}`, { method, headers: auth }), e, { fetch: sb.fetchMock as typeof fetch });
      expect(res.status, p).toBe(404);
    }
    expect(reached).toHaveLength(0);
  });

  it("hands out tickets and file keys that name the account, and routes them there", async () => {
    const sb = supabase();
    const { e, reached } = env();
    const deps = { fetch: sb.fetchMock as typeof fetch };
    const auth = { authorization: `Bearer ${sb.session()}` };
    const ticket = (await (await handle(new Request("https://orbis.example/api/v1/stream/ticket", { method: "POST", headers: auth }), e, deps)).json()) as { ticket: string };
    expect(ticket.ticket).toBe(`${ANA}~a_ticket123456`);
    const key = (await (await handle(new Request("https://orbis.example/api/v1/files/key", { method: "POST", headers: auth }), e, deps)).json()) as { key: string };
    expect(key.key).toBe(`${ANA}~abc.def12345`);

    reached.length = 0;
    await handle(new Request(`https://orbis.example/api/v1/files/f1/content?key=${encodeURIComponent(key.key)}`), e, deps);
    expect(reached[0]!.account).toBe(ANA);
    expect(reached[0]!.req.headers.get("x-orbis-path")).toBe("/api/v1/files/f1/content?key=abc.def12345");
    await handle(new Request(`https://orbis.example/api/v1/stream?ticket=${encodeURIComponent(`${BIA}~a_ticket123456`)}`, { headers: { upgrade: "websocket" } }), e, deps);
    expect(reached[1]!.account).toBe(BIA);
    expect(reached[1]!.req.headers.get("x-orbis-kind")).toBe("stream");
    expect(reached[1]!.req.headers.get("x-orbis-path")).toBe("/api/v1/stream?ticket=a_ticket123456");
    // No account named, or not a uuid: refused before any account.
    expect((await handle(new Request("https://orbis.example/api/v1/stream?ticket=a_ticket123456", { headers: { upgrade: "websocket" } }), e, deps)).status).toBe(401);
    expect((await handle(new Request("https://orbis.example/api/v1/files/f1/content?key=../x~abcdefgh"), e, deps)).status).toBe(401);
    expect(reached).toHaveLength(2);
  });

  it("takes a hub's relay only with a device token Supabase knows, and gives it to the token's account", async () => {
    const sb = supabase();
    const { e, reached } = env();
    const deps = { fetch: sb.fetchMock as typeof fetch };
    const open = (authorization?: string) => handle(new Request("https://orbis.example/runner", { headers: { upgrade: "websocket", ...(authorization ? { authorization } : {}) } }), e, deps);
    expect((await open()).status).toBe(401);
    expect((await open(`Bearer ${DEVICE}`)).status).toBe(401);
    expect((await open(`Device ${"q".repeat(43)}`)).status).toBe(401);
    expect(reached).toHaveLength(0);
    expect((await open(`Device ${DEVICE}`)).status).toBe(200);
    expect(reached[0]!.account).toBe(ANA);
    expect(reached[0]!.req.headers.get("x-orbis-kind")).toBe("runner");
    expect(reached[0]!.req.headers.get("x-orbis-device")).toBe("11111111-2222-4333-8444-555555555555");
    // The token goes to Supabase only, in a body; never on to the account's object.
    expect(reached[0]!.req.headers.get("authorization")).toBeNull();
    sb.state.revoked = true;
    const revoked = await open(`Device ${DEVICE}`);
    expect(revoked.status).toBe(401);
    expect(((await revoked.json()) as { error: { code: string } }).error.code).toBe("device_revoked");
  });

  it("limits requests by address when the limiter says so", async () => {
    const { e } = env();
    e.LIMITER = { limit: async () => ({ success: false }) };
    expect((await handle(new Request("https://orbis.example/api/v1/auth/config"), e)).status).toBe(429);
    // The app's pages are not limited.
    expect((await handle(new Request("https://orbis.example/"), e)).status).toBe(200);
  });
});

/** A WebSocket of the platform, recording what it was sent. */
class FakeSocket implements Socket {
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private attachment: unknown = null;
  constructor(readonly tags: string[] = []) {}
  send(data: string) {
    if (this.closed) throw new Error("closed");
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  serializeAttachment(v: unknown) {
    this.attachment = v;
  }
  deserializeAttachment() {
    return this.attachment;
  }
  frames(): RelayFrame[] {
    return this.sent.map((s) => parseFrame(s)).filter((f): f is RelayFrame => f !== null);
  }
}

function durableObject() {
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  let now = 1_000_000;
  let n = 0;
  const state: State = {
    acceptWebSocket: (ws, tags = []) => {
      (ws as FakeSocket).tags.push(...tags);
      sockets.push(ws as FakeSocket);
    },
    getWebSockets: (tag) => sockets.filter((s) => !s.closed && (!tag || s.tags.includes(tag))),
    getTags: (ws) => (ws as FakeSocket).tags,
    setWebSocketAutoResponse: () => undefined,
    storage: { setAlarm: (at) => void (alarm = at), getAlarm: () => alarm },
  };
  const platform: Platform = {
    pair: () => ({ client: {}, server: new FakeSocket() }),
    upgrade: () => new Response(null, { status: 200, headers: { "x-upgraded": "1" } }),
    autoResponse: () => null,
    now: () => now,
    id: () => `id${++n}`,
  };
  const obj = new Account(state, {}, platform);
  const req = (kind: string, p: string, init: RequestInit = {}) =>
    obj.fetch(new Request("https://account.orbis/relay", { ...init, headers: { ...(init.headers as Record<string, string>), "x-orbis-kind": kind, "x-orbis-path": p, upgrade: "websocket" } }));
  return {
    obj,
    sockets,
    req,
    connectRunner: async () => {
      await req("runner", "/runner", { headers: { "x-orbis-device": "dev-1" } });
      return sockets.filter((s) => s.tags.includes("runner")).at(-1)!;
    },
    alarm: () => alarm,
    tick: (ms: number) => void (now += ms),
  };
}

describe("an account's Durable Object", () => {
  it("says the phone is off while no hub is connected", async () => {
    const d = durableObject();
    const res = await d.req("http", "/api/v1/bots");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("runner_offline");
    expect((await d.req("stream", "/api/v1/stream?ticket=t")).status).toBe(503);
  });

  it("relays a request to the hub and its answer back, large bodies in pieces both ways", async () => {
    const d = durableObject();
    const runner = await d.connectRunner();
    expect(d.alarm()).not.toBeNull();
    const big = new Uint8Array(RELAY_CHUNK_BYTES + 10).fill(7);
    const pending = d.req("http", "/api/v1/conversations/c1/files", { method: "POST", body: big, headers: { authorization: "Bearer s", "x-orbis-ip": "203.0.113.7" } });
    await vi.waitFor(() => expect(runner.frames().filter((f) => f.t === "data")).toHaveLength(2));
    const head = runner.frames()[0] as Extract<RelayFrame, { t: "req" }>;
    expect(head).toMatchObject({ t: "req", method: "POST", path: "/api/v1/conversations/c1/files", end: false, ip: "203.0.113.7" });
    expect(head.headers.authorization).toBe("Bearer s");
    expect(Object.keys(head.headers).some((k) => k.startsWith("x-orbis"))).toBe(false);
    const got = new BodyCollector(1 << 30);
    for (const f of runner.frames()) if (f.t === "data") got.add(f.data);
    expect(got.bytes()).toEqual(big);

    const answer = new TextEncoder().encode("x".repeat(RELAY_CHUNK_BYTES * 2));
    await d.obj.webSocketMessage(runner, JSON.stringify({ t: "res", id: head.id, status: 201, headers: { "content-type": "text/plain", "set-cookie": "no" }, end: false }));
    for (const f of bodyFrames(head.id, answer)) await d.obj.webSocketMessage(runner, JSON.stringify(f));
    const res = await pending;
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await res.text()).length).toBe(answer.length);
  });

  it("relays the event stream both ways under its own id", async () => {
    const d = durableObject();
    const runner = await d.connectRunner();
    expect((await d.req("stream", "/api/v1/stream?ticket=a_t")).headers.get("x-upgraded")).toBe("1");
    const browser = d.sockets.find((s) => s.tags.includes("browser"))!;
    const open = runner.frames().find((f) => f.t === "open") as Extract<RelayFrame, { t: "open" }>;
    expect(open.path).toBe("/api/v1/stream?ticket=a_t");
    await d.obj.webSocketMessage(browser, '{"type":"subscribe"}');
    expect(runner.frames().at(-1)).toEqual({ t: "msg", id: open.id, data: '{"type":"subscribe"}' });
    await d.obj.webSocketMessage(runner, JSON.stringify({ t: "msg", id: open.id, data: '{"type":"subscribed"}' }));
    expect(browser.sent).toEqual(['{"type":"subscribed"}']);
    // The browser leaving tells the hub.
    browser.close(1000);
    await d.obj.webSocketClose(browser, 1000);
    expect(runner.frames().at(-1)).toEqual({ t: "close", id: open.id, code: 1000 });
  });

  it("when the phone goes offline: waiting requests and open streams hear it", async () => {
    const d = durableObject();
    const runner = await d.connectRunner();
    await d.req("stream", "/api/v1/stream?ticket=a_t");
    const pending = d.req("http", "/api/v1/bots");
    await vi.waitFor(() => expect(runner.frames().some((f) => f.t === "req")).toBe(true));
    runner.close(1006);
    await d.obj.webSocketClose(runner, 1006);
    expect((await pending).status).toBe(503);
    expect(d.sockets.find((s) => s.tags.includes("browser"))!.closed?.code).toBe(1012);
  });

  it("keeps one hub per account: the newest, the one replaced is told so", async () => {
    const d = durableObject();
    const first = await d.connectRunner();
    const second = await d.connectRunner();
    expect(first.closed?.code).toBe(RELAY_REPLACED);
    expect(second.closed).toBeNull();
    // The replaced one leaving does not take the account offline.
    await d.obj.webSocketClose(first, RELAY_REPLACED);
    const pending = d.req("http", "/api/v1/bots");
    await vi.waitFor(() => expect(second.frames().some((f) => f.t === "req")).toBe(true));
    const id = (second.frames()[0] as { id: string }).id;
    await d.obj.webSocketMessage(second, JSON.stringify({ t: "res", id, status: 200, headers: {}, end: true }));
    expect((await pending).status).toBe(200);
    // A message from the replaced hub is ignored.
    await d.obj.webSocketMessage(first, JSON.stringify({ t: "res", id: "x", status: 200, headers: {}, end: true }));
  });

  it("opens an old relay again so its device token is checked again", async () => {
    const d = durableObject();
    const runner = await d.connectRunner();
    d.tick(RELAY_RENEW_MS - 1);
    await d.obj.alarm();
    expect(runner.closed).toBeNull();
    d.tick(1);
    await d.obj.alarm();
    expect(runner.closed?.code).toBe(1012);
  });
});
