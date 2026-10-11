// The Orbis cloud's Worker (change 0068-cloud-relay, specs/cloud, ADR 0024): it serves the web app from its
// static assets and relays the app's API to the account's own hub — the phone — through that account's
// Durable Object. It reimplements nothing and keeps no secret: a browser proves its account with its Supabase
// session (checked here and again on the hub), a hub proves its device with its token (checked by Supabase).
import { SessionVerifier, InvalidSession } from "./jwt.js";
import { errorJson, secure } from "./security.js";

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCOUNT: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
  /** The account's Supabase project: its address and publishable key, both public by design. */
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  /** Requests one address may make in a minute (wrangler.jsonc `ratelimits`); absent in tests. */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A ticket or file key the cloud handed out: the account's id, then the hub's own value. */
const SCOPED = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})~([A-Za-z0-9._-]{8,200})$/;
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{40,128}$/;

/** Paths of the hub that make no sense, or are not safe, through the cloud. */
function blocked(method: string, path: string): boolean {
  // A pairing code trades for the hub's own token, and the hub's links to the account are made with that
  // token: only on the hub's own network. Unlinking the account from the cloud would lock the cloud out.
  return (
    path.startsWith("/api/v1/pairing") ||
    path.startsWith("/api/v1/device") ||
    path === "/api/v1/account/link" ||
    (path === "/api/v1/account" && method === "DELETE")
  );
}

let verifier: SessionVerifier | null = null;
function sessions(env: Env, deps: Deps): SessionVerifier {
  if (!verifier || verifier.issuer !== `${env.SUPABASE_URL}/auth/v1` || deps.fetch) verifier = new SessionVerifier(env.SUPABASE_URL, deps.fetch, deps.now);
  return verifier;
}

const account = (env: Env, userId: string) => env.ACCOUNT.get(env.ACCOUNT.idFromName(userId));

/** The address a request came from, as Cloudflare saw it. */
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? "0.0.0.0";

/** The request as the account's Durable Object takes it: what to relay, from whom, and nothing of the cloud's. */
async function toAccount(req: Request, path: string, extra: Record<string, string>, keepAuth = true): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of req.headers) {
    const key = k.toLowerCase();
    if ((key === "authorization" && !keepAuth) || key === "cookie" || key.startsWith("cf-") || key.startsWith("x-orbis-") || key === "x-forwarded-for" || key === "x-real-ip") continue;
    headers.set(key, v);
  }
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  headers.set("x-orbis-ip", ipOf(req));
  headers.set("x-orbis-path", path);
  return new Request("https://account.orbis/relay", {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
  });
}

export async function handle(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  return secure(await route(req, env, deps), env.SUPABASE_URL);
}

async function route(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const isApi = path.startsWith("/api/") || path.startsWith("/v1/");
  if (path === "/runner" || isApi) {
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ipOf(req) })).success) return errorJson(429, "too_many_requests", "too many requests from this address: wait a minute");
  }
  if (path === "/runner") return runner(req, env, deps);
  if (path === "/health") return Response.json({ ok: true, cloud: true });
  if (!isApi) return env.ASSETS.fetch(req);

  // Before signing in: where accounts sign in; through the cloud, an account always opens its hub.
  if (path === "/api/v1/auth/config") return Response.json({ supabase: { url: env.SUPABASE_URL, key: env.SUPABASE_KEY }, linked: true });
  if (blocked(req.method, path)) return errorJson(404, "not_in_cloud", "this is done on the hub itself, not through the cloud");
  const relayPath = path + url.search;

  // A browser's WebSocket and a file's <img> send no Authorization header: their one-time ticket or file key
  // names the account (the hub still checks its own part).
  if (path === "/api/v1/stream" || /^\/api\/v1\/files\/[^/]+\/content$/.test(path)) {
    const param = path === "/api/v1/stream" ? "ticket" : "key";
    const scoped = SCOPED.exec(url.searchParams.get(param) ?? "");
    if (!scoped) return errorJson(401, "unauthorized", "missing or invalid credentials");
    const [, userId, own] = scoped as unknown as [string, string, string];
    url.searchParams.set(param, own);
    if (path === "/api/v1/stream" && req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorJson(426, "upgrade_required", "the stream is a WebSocket");
    return account(env, userId).fetch(await toAccount(req, path + url.search, { "x-orbis-kind": path === "/api/v1/stream" ? "stream" : "http" }));
  }

  const auth = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!auth) return errorJson(401, "unauthorized", "sign in with your account");
  let userId: string;
  try {
    userId = (await sessions(env, deps).verify(auth[1]!.trim())).userId;
  } catch (err) {
    if (err instanceof InvalidSession) return errorJson(401, "unauthorized", "your session does not hold: sign in again");
    throw err;
  }
  const res = await account(env, userId).fetch(await toAccount(req, relayPath, { "x-orbis-kind": "http" }));
  // The ticket and the file key the hub hands out name the account, so the cloud knows where they go.
  if (res.ok && req.method === "POST" && (path === "/api/v1/stream/ticket" || path === "/api/v1/files/key")) {
    const body = (await res.json()) as Record<string, unknown>;
    const field = path === "/api/v1/stream/ticket" ? "ticket" : "key";
    if (typeof body[field] === "string") body[field] = `${userId}~${body[field]}`;
    return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  return res;
}

/** A hub of an account opens its relay: its device token, checked by Supabase, names the account. */
async function runner(req: Request, env: Env, deps: Deps): Promise<Response> {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorJson(426, "upgrade_required", "the relay is a WebSocket");
  const m = /^Device\s+(\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m || !DEVICE_TOKEN.test(m[1]!)) return errorJson(401, "unauthorized", "the relay opens with the device's token");
  const fetcher = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let res: Response;
  try {
    res = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/device_identity`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_token: m[1] }),
    });
  } catch {
    return errorJson(502, "accounts_unreachable", "the accounts cannot be reached");
  }
  const body = (await res.json().catch(() => null)) as Array<{ owner_id?: string; device_id?: string }> | { code?: string } | null;
  const found = Array.isArray(body) ? body[0] : null;
  if (!res.ok || !found?.owner_id || !UUID.test(found.owner_id)) {
    const revoked = !res.ok && (body as { code?: string } | null)?.code === "28000";
    return errorJson(revoked ? 401 : 502, revoked ? "device_revoked" : "accounts_refused", revoked ? "the account revoked this device" : "the accounts did not answer");
  }
  // The device's token stays here: the account's object needs only whose it is.
  return account(env, found.owner_id).fetch(await toAccount(req, "/runner", { "x-orbis-kind": "runner", "x-orbis-device": found.device_id ?? "" }, false));
}
