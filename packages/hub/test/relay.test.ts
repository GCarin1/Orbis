// specs/cloud — the relay to the Orbis cloud (change 0068-cloud-relay): once linked as a device, this hub opens
// one WebSocket out to the cloud with its device token in the Authorization header, answers the requests the
// cloud relays with its own routes (the account's session checked again), in pieces when large, relays its
// event stream, and closes when unlinked or revoked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { bodyFrames, BodyCollector, parseFrame, RELAY_CHUNK_BYTES, RELAY_REPLACED, RELAY_REVOKED, type DeviceStatus, type RelayFrame } from "@orbis/shared";
import { DEFAULT_SUPABASE } from "../src/config.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

const ANA = "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60";
const DEVICE_TOKEN = "dvc_" + "y".repeat(43);

/** The account's Supabase: sign-in keys and the device functions. */
function supabase() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = (sub = ANA) => {
    const now = Math.floor(Date.now() / 1000);
    const head = `${b64({ alg: "ES256", kid: "k1" })}.${b64({ iss: `${DEFAULT_SUPABASE.url}/auth/v1`, aud: "authenticated", role: "authenticated", sub, email: "ana@example.com", exp: now + 600 })}`;
    return `${head}.${sign("sha256", Buffer.from(head), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }] });
    const fn = u.split("/rpc/")[1];
    if (fn === "register_device") return Response.json([{ id: "11111111-2222-4333-8444-555555555555", token: DEVICE_TOKEN }]);
    if (fn === "device_sync") return Response.json({ upserted: 0, deleted: 0 });
    if (fn === "device_unlink") return Response.json(true);
    return Response.json({ message: "no such function" }, { status: 404 });
  });
  return { fetchMock, session };
}

/** The cloud's Durable Object as the hub sees it: a WebSocket server taking runners at /runner. */
async function fakeCloud() {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise((r) => wss.once("listening", r));
  const runners: Array<{ socket: ServerSocket; url: string; authorization: string | undefined; frames: RelayFrame[] }> = [];
  const connected = new Promise<(typeof runners)[number]>((resolve) => {
    wss.on("connection", (socket, req) => {
      const runner = { socket, url: req.url ?? "", authorization: req.headers.authorization, frames: [] as RelayFrame[] };
      socket.on("message", (raw) => {
        const f = parseFrame(String(raw));
        if (f) runner.frames.push(f);
      });
      runners.push(runner);
      resolve(runner);
    });
  });
  const url = `http://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  let n = 0;
  /** Relay one request to the hub; resolves with its whole answer. */
  const request = (runner: (typeof runners)[number], method: string, path: string, headers: Record<string, string>, body?: Uint8Array) => {
    const id = `r${++n}`;
    return new Promise<{ status: number; headers: Record<string, string>; body: Buffer; pieces: number }>((resolve) => {
      let head: Extract<RelayFrame, { t: "res" }> | null = null;
      const collected = new BodyCollector(64 * 1024 * 1024);
      let pieces = 0;
      const onMessage = (raw: unknown) => {
        const f = parseFrame(String(raw));
        if (!f || !("id" in f) || f.id !== id) return;
        if (f.t === "res") head = f;
        if (f.t === "data") {
          pieces++;
          collected.add(f.data);
        }
        if (head && (head.end || (f.t === "data" && f.end))) {
          runner.socket.off("message", onMessage);
          resolve({ status: head.status, headers: head.headers, body: Buffer.from(collected.bytes()), pieces });
        }
      };
      runner.socket.on("message", onMessage);
      const bytes = body ?? new Uint8Array();
      runner.socket.send(JSON.stringify({ t: "req", id, method, path, headers, end: bytes.length === 0, ip: "203.0.113.9" } satisfies RelayFrame));
      for (const f of bodyFrames(id, bytes)) runner.socket.send(JSON.stringify(f));
    });
  };
  const next = (runner: (typeof runners)[number], match: (f: RelayFrame) => boolean) =>
    new Promise<RelayFrame>((resolve) => {
      const found = runner.frames.find(match);
      if (found) return resolve(found);
      const onMessage = (raw: unknown) => {
        const f = parseFrame(String(raw));
        if (f && match(f)) {
          runner.socket.off("message", onMessage);
          resolve(f);
        }
      };
      runner.socket.on("message", onMessage);
    });
  return { wss, url, runners, connected, request, next, close: () => new Promise((r) => wss.close(r)) };
}

let t: TestHub | null = null;
let cloud: Awaited<ReturnType<typeof fakeCloud>> | null = null;
afterEach(async () => {
  await t?.cleanup();
  await cloud?.close();
  t = null;
  cloud = null;
});

async function linkedHub() {
  const sb = supabase();
  cloud = await fakeCloud();
  t = await testHub({ auth: { fetch: sb.fetchMock as typeof fetch }, cloud: { fetch: sb.fetchMock as typeof fetch }, config: { cloudUrl: cloud.url } });
  // Not linked: no relay.
  expect(((await t.api("GET", "/api/v1/device")).body as DeviceStatus).cloud).toEqual({ url: cloud.url, connected: false, lastError: null });
  expect(cloud.runners).toHaveLength(0);
  const linked = await t.api("POST", "/api/v1/device/link", { name: "Celular", accessToken: sb.session() });
  expect(linked.status).toBe(200);
  const runner = await cloud.connected;
  await vi.waitFor(() => expect(((t!.hub.sync.status()) as DeviceStatus).cloud.connected).toBe(true));
  return { sb, runner };
}

describe("the relay to the Orbis cloud", () => {
  it("opens out with the device token in the Authorization header, never in the address", async () => {
    const { runner } = await linkedHub();
    expect(runner.url).toBe("/runner");
    expect(runner.authorization).toBe(`Device ${DEVICE_TOKEN}`);
    expect(runner.url).not.toContain(DEVICE_TOKEN);
    expect(((await t!.api("GET", "/api/v1/device")).body as DeviceStatus).cloud).toMatchObject({ connected: true, lastError: null });
  });

  it("answers relayed requests with the hub's own routes, and its auth checks the account's session again", async () => {
    const { sb, runner } = await linkedHub();
    await createBot(t!, { name: "Ana" });
    const bots = await cloud!.request(runner, "GET", "/api/v1/bots", { authorization: `Bearer ${sb.session()}` });
    expect(bots.status).toBe(200);
    expect(bots.headers["content-type"]).toMatch(/application\/json/);
    expect((JSON.parse(bots.body.toString()) as Array<{ name: string }>).map((b) => b.name)).toEqual(["Ana"]);
    // No session, another account's session, a cookie: the hub's own answers.
    expect((await cloud!.request(runner, "GET", "/api/v1/bots", {})).status).toBe(401);
    expect((await cloud!.request(runner, "GET", "/api/v1/bots", { authorization: `Bearer ${sb.session("0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d")}` })).status).toBe(401);
    // A session never manages the device link, even through the cloud.
    expect((await cloud!.request(runner, "DELETE", "/api/v1/device", { authorization: `Bearer ${sb.session()}` })).status).toBe(403);
    // Only the API crosses: not the hub's pages, hooks or tools.
    expect((await cloud!.request(runner, "GET", "/health", {})).status).toBe(404);
    const created = await cloud!.request(
      runner,
      "POST",
      "/api/v1/bots",
      { authorization: `Bearer ${sb.session()}`, "content-type": "application/json" },
      new TextEncoder().encode(JSON.stringify({ name: "Bia", brain: { kind: "mock" } })),
    );
    expect(created.status).toBe(201);
    expect(t!.hub.db.prepare("SELECT name FROM bots ORDER BY name").all()).toEqual([{ name: "Ana" }, { name: "Bia" }]);
  });

  it("carries large bodies both ways in pieces", async () => {
    const { sb, runner } = await linkedHub();
    const conv = (await t!.api("GET", `/api/v1/bots/${(await createBot(t!, { name: "Ana" })).id}/conversation`)).body as { id: string };
    const big = Buffer.alloc(RELAY_CHUNK_BYTES * 2 + 1234);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const auth = { authorization: `Bearer ${sb.session()}` };
    const up = await cloud!.request(runner, "POST", `/api/v1/conversations/${conv.id}/files`, { ...auth, "x-file-name": "grande.bin", "content-type": "application/octet-stream" }, big);
    expect(up.status).toBe(201);
    const file = JSON.parse(up.body.toString()) as { id: string; size: number };
    expect(file.size).toBe(big.length);
    const key = (JSON.parse((await cloud!.request(runner, "POST", "/api/v1/files/key", auth)).body.toString()) as { key: string }).key;
    const down = await cloud!.request(runner, "GET", `/api/v1/files/${file.id}/content?key=${key}`, {});
    expect(down.status).toBe(200);
    expect(down.pieces).toBe(3);
    expect(down.body.equals(big)).toBe(true);
  });

  it("relays the event stream opened with a one-time ticket", async () => {
    const { sb, runner } = await linkedHub();
    const ticket = (JSON.parse((await cloud!.request(runner, "POST", "/api/v1/stream/ticket", { authorization: `Bearer ${sb.session()}` })).body.toString()) as { ticket: string }).ticket;
    runner.socket.send(JSON.stringify({ t: "open", id: "s1", path: `/api/v1/stream?ticket=${encodeURIComponent(ticket)}` } satisfies RelayFrame));
    await cloud!.next(runner, (f) => f.t === "opened" && f.id === "s1");
    runner.socket.send(JSON.stringify({ t: "msg", id: "s1", data: JSON.stringify({ type: "subscribe" }) } satisfies RelayFrame));
    await cloud!.next(runner, (f) => f.t === "msg" && f.id === "s1" && f.data.includes('"subscribed"'));
    await createBot(t!, { name: "Ana" });
    const event = (await cloud!.next(runner, (f) => f.t === "msg" && f.id === "s1" && f.data.includes('"bot.updated"'))) as Extract<RelayFrame, { t: "msg" }>;
    expect(JSON.parse(event.data).data.bot.name).toBe("Ana");
    // A ticket opens once.
    runner.socket.send(JSON.stringify({ t: "open", id: "s2", path: `/api/v1/stream?ticket=${encodeURIComponent(ticket)}` } satisfies RelayFrame));
    expect(await cloud!.next(runner, (f) => f.t === "close" && f.id === "s2")).toMatchObject({ code: 4401 });
    // The cloud's end leaving closes the hub's stream.
    runner.socket.send(JSON.stringify({ t: "close", id: "s1" } satisfies RelayFrame));
    await vi.waitFor(() => expect((t!.hub.relay as unknown as { streams: Map<string, unknown> }).streams.size).toBe(0));
  });

  it("closes once the device is unlinked, and stays closed when the cloud says it was revoked", async () => {
    const { runner } = await linkedHub();
    const closed = new Promise<number>((r) => runner.socket.once("close", (code) => r(code)));
    await t!.api("DELETE", "/api/v1/device");
    expect(await closed).toBe(1000);
    expect(((await t!.api("GET", "/api/v1/device")).body as DeviceStatus).cloud.connected).toBe(false);
  });

  it("does not come back when the cloud refuses the device as revoked", async () => {
    const { runner } = await linkedHub();
    runner.socket.close(RELAY_REVOKED, "revoked");
    await vi.waitFor(() => expect(t!.hub.sync.status().cloud.lastError).toBe("the account revoked this device"));
    t!.hub.relay.sync();
    await new Promise((r) => setTimeout(r, 200));
    expect(cloud!.runners).toHaveLength(1);
  });

  it("gives way for good when another hub of the account takes the cloud, until its link changes (change 0069)", async () => {
    const { sb, runner } = await linkedHub();
    runner.socket.close(RELAY_REPLACED, "replaced");
    await vi.waitFor(() => expect(t!.hub.sync.status().cloud.lastError).toMatch(/another hub of this account took over the cloud/));
    // The phone and a server would otherwise take the relay from each other: no retry, however long.
    t!.hub.relay.sync();
    await new Promise((r) => setTimeout(r, 300));
    expect(cloud!.runners).toHaveLength(1);
    // Unlinked and linked again (the user chose this hub): it tries again.
    await t!.api("DELETE", "/api/v1/device");
    const second = new Promise((r) => cloud!.wss.once("connection", r));
    expect((await t!.api("POST", "/api/v1/device/link", { name: "Servidor", accessToken: sb.session() })).status).toBe(200);
    await second;
    expect(cloud!.runners).toHaveLength(2);
  });
});
