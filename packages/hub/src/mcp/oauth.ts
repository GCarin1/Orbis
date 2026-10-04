// Signing in to a remote MCP server with the user's account (the MCP
// authorization flow): find the authorization server from the server's
// protected-resource metadata (RFC 9728, RFC 8414), register Orbis as a client
// on the fly (RFC 7591), send the user to sign in with PKCE (RFC 7636), and
// trade the code for tokens that the hub keeps encrypted and refreshes.
import { createHash, randomBytes } from "node:crypto";

export interface AuthServerMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
}

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  /** Epoch milliseconds, when the server said. */
  expires_at?: number;
  token_type?: string;
}

export class OAuthError extends Error {}

type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `resource_metadata="…"` from a WWW-Authenticate header. */
export function resourceMetadataUrl(wwwAuthenticate: string | null): string | null {
  const m = /resource_metadata="([^"]+)"/.exec(wwwAuthenticate ?? "");
  return m ? m[1]! : null;
}

/** `scope="…"` from a WWW-Authenticate header. */
function challengeScope(wwwAuthenticate: string | null): string | null {
  const m = /scope="([^"]+)"/.exec(wwwAuthenticate ?? "");
  return m ? m[1]! : null;
}

/** Where the server's authorization server is, and what it offers. */
export async function discover(
  serverUrl: string,
  wwwAuthenticate: string | null,
  fetchImpl: Fetch = (...args) => fetch(...args),
): Promise<{ metadata: AuthServerMetadata; resource: string; scope: string | null }> {
  const server = new URL(serverUrl);
  const path = server.pathname.replace(/\/+$/, "");
  const candidates = [
    resourceMetadataUrl(wwwAuthenticate),
    `${server.origin}/.well-known/oauth-protected-resource${path}`,
    `${server.origin}/.well-known/oauth-protected-resource`,
  ].filter((u): u is string => Boolean(u));
  let issuer = server.origin;
  let resource = serverUrl;
  let scope = challengeScope(wwwAuthenticate);
  for (const url of candidates) {
    const prm = await getJson(fetchImpl, url);
    const servers = prm?.authorization_servers as string[] | undefined;
    if (servers?.length) {
      issuer = servers[0]!;
      if (typeof prm!.resource === "string") resource = prm!.resource;
      if (!scope && Array.isArray(prm!.scopes_supported) && prm!.scopes_supported.length) scope = (prm!.scopes_supported as string[]).join(" ");
      break;
    }
  }
  const base = new URL(issuer);
  const issuerPath = base.pathname.replace(/\/+$/, "");
  const metaUrls = [
    `${base.origin}/.well-known/oauth-authorization-server${issuerPath}`,
    `${base.origin}/.well-known/openid-configuration${issuerPath}`,
    `${base.origin}${issuerPath}/.well-known/openid-configuration`,
    `${base.origin}/.well-known/oauth-authorization-server`,
  ];
  for (const url of metaUrls) {
    const meta = await getJson(fetchImpl, url);
    if (meta && typeof meta.authorization_endpoint === "string" && typeof meta.token_endpoint === "string") {
      return { metadata: meta as unknown as AuthServerMetadata, resource, scope };
    }
  }
  throw new OAuthError(`${server.host} asks to sign in, but publishes no OAuth authorization server Orbis can use`);
}

/** Register Orbis as a public client with the loopback redirect (RFC 7591). */
export async function register(metadata: AuthServerMetadata, redirectUri: string, fetchImpl: Fetch = (...args) => fetch(...args)): Promise<OAuthClient> {
  if (!metadata.registration_endpoint) {
    throw new OAuthError("this server does not let apps register themselves; paste a token instead (a custom server with a token)");
  }
  const res = await fetchImpl(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Orbis",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.client_id !== "string") {
    throw new OAuthError(`registering Orbis failed (${res.status}): ${String(body.error_description ?? body.error ?? "no client id")}`);
  }
  return { client_id: body.client_id, ...(typeof body.client_secret === "string" ? { client_secret: body.client_secret } : {}) };
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(
  metadata: AuthServerMetadata,
  client: OAuthClient,
  opts: { redirectUri: string; state: string; challenge: string; resource: string; scope: string | null; params?: Record<string, string> },
): string {
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // An MCP server's own resource (RFC 8707); a provider's plain OAuth (Google's) has none.
  if (opts.resource) url.searchParams.set("resource", opts.resource);
  if (opts.scope) url.searchParams.set("scope", opts.scope);
  for (const [key, value] of Object.entries(opts.params ?? {})) url.searchParams.set(key, value);
  return url.href;
}

async function tokenRequest(metadata: AuthServerMetadata, client: OAuthClient, form: Record<string, string>, fetchImpl: Fetch): Promise<OAuthTokens> {
  const fields = Object.fromEntries(Object.entries(form).filter(([key, value]) => key !== "resource" || value));
  const body = new URLSearchParams({ ...fields, client_id: client.client_id, ...(client.client_secret ? { client_secret: client.client_secret } : {}) });
  const res = await fetchImpl(metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new OAuthError(`the sign-in could not be completed (${res.status}): ${String(json.error_description ?? json.error ?? "no access token")}`);
  }
  return {
    access_token: json.access_token,
    ...(typeof json.refresh_token === "string" ? { refresh_token: json.refresh_token } : {}),
    ...(typeof json.expires_in === "number" ? { expires_at: Date.now() + json.expires_in * 1000 } : {}),
    ...(typeof json.token_type === "string" ? { token_type: json.token_type } : {}),
  };
}

export function exchangeCode(
  metadata: AuthServerMetadata,
  client: OAuthClient,
  opts: { code: string; verifier: string; redirectUri: string; resource: string },
  fetchImpl: Fetch = (...args) => fetch(...args),
): Promise<OAuthTokens> {
  return tokenRequest(
    metadata,
    client,
    { grant_type: "authorization_code", code: opts.code, code_verifier: opts.verifier, redirect_uri: opts.redirectUri, resource: opts.resource },
    fetchImpl,
  );
}

export async function refreshTokens(
  metadata: AuthServerMetadata,
  client: OAuthClient,
  tokens: OAuthTokens,
  resource: string,
  fetchImpl: Fetch = (...args) => fetch(...args),
): Promise<OAuthTokens> {
  if (!tokens.refresh_token) throw new OAuthError("the sign-in expired; sign in again");
  const next = await tokenRequest(metadata, client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource }, fetchImpl);
  return { ...next, refresh_token: next.refresh_token ?? tokens.refresh_token };
}

/** True when the token expires within a minute. */
export const expiring = (tokens: OAuthTokens, now = Date.now()) => tokens.expires_at !== undefined && tokens.expires_at - now < 60_000;
