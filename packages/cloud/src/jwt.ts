// The Worker's check of a Supabase Auth session (change 0068-cloud-relay, specs/cloud): the same rule as the
// hub's (packages/hub/src/auth/jwt.ts), on WebCrypto. The Worker keeps no secret: it checks the token with
// the keys the project publishes, and takes it only when its signature, issuer, audience, role and lifetime
// hold. The hub checks it again when the relayed request reaches it.

export const JWKS_TTL_MS = 10 * 60_000;
export const JWKS_REFETCH_MS = 30_000;
export const CLOCK_SKEW_S = 30;

export interface SessionClaims {
  userId: string;
  email: string | null;
  exp: number;
}

export class InvalidSession extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const looksLikeJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

function bytes(segment: string): Uint8Array<ArrayBuffer> {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function part<T>(segment: string, what: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(bytes(segment))) as T;
  } catch {
    throw new InvalidSession(`the token's ${what} is not JSON`);
  }
}

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type Key = { key: CryptoKey; alg: "ES256" | "RS256" };

export class SessionVerifier {
  private keys = new Map<string, Key>();
  private fetchedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly projectUrl: string,
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
    private readonly now: () => number = Date.now,
  ) {}

  get issuer(): string {
    return `${this.projectUrl}/auth/v1`;
  }

  async verify(token: string): Promise<SessionClaims> {
    if (!looksLikeJwt(token)) throw new InvalidSession("not a session token");
    const [h, p, s] = token.split(".") as [string, string, string];
    const header = part<{ alg?: string; kid?: string }>(h, "header");
    if (header.alg !== "ES256" && header.alg !== "RS256") throw new InvalidSession(`the token is signed with ${header.alg ?? "nothing"}`);
    if (!header.kid) throw new InvalidSession("the token names no key");
    const found = await this.key(header.kid);
    if (!found || found.alg !== header.alg) throw new InvalidSession("the token's key is not the project's");
    const algorithm = header.alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
    const ok = await crypto.subtle.verify(algorithm, found.key, bytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) throw new InvalidSession("the token's signature does not hold");

    const claims = part<Record<string, unknown>>(p, "payload");
    const nowS = Math.floor(this.now() / 1000);
    if (claims.iss !== this.issuer) throw new InvalidSession("the token is not from this project");
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes("authenticated")) throw new InvalidSession("the token is not for signed-in users");
    if (claims.role !== "authenticated" || claims.is_anonymous === true) throw new InvalidSession("the token is not a signed-in account's");
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= nowS) throw new InvalidSession("the session expired");
    if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) throw new InvalidSession("the token is not valid yet");
    if (typeof claims.sub !== "string" || !UUID.test(claims.sub)) throw new InvalidSession("the token names no account");
    return { userId: claims.sub.toLowerCase(), email: typeof claims.email === "string" ? claims.email : null, exp: claims.exp };
  }

  private async key(kid: string): Promise<Key | undefined> {
    const at = this.now();
    const stale = at - this.fetchedAt > JWKS_TTL_MS;
    const unknown = !this.keys.has(kid) && at - this.fetchedAt > JWKS_REFETCH_MS;
    if (stale || unknown) await this.load();
    return this.keys.get(kid);
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const res = await this.fetcher(`${this.issuer}/.well-known/jwks.json`, { headers: { accept: "application/json" } });
        if (!res.ok) throw new InvalidSession(`the project's keys answered HTTP ${res.status}`);
        const body = (await res.json()) as { keys?: Jwk[] };
        const keys = new Map<string, Key>();
        for (const jwk of body.keys ?? []) {
          if (!jwk.kid || (jwk.use && jwk.use !== "sig")) continue;
          const alg = jwk.alg ?? (jwk.kty === "EC" ? "ES256" : jwk.kty === "RSA" ? "RS256" : "");
          try {
            if (alg === "ES256") {
              keys.set(jwk.kid, { alg, key: await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]) });
            } else if (alg === "RS256") {
              keys.set(jwk.kid, { alg, key: await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]) });
            }
          } catch {
            /* a key WebCrypto cannot read is skipped */
          }
        }
        this.keys = keys;
        this.fetchedAt = this.now();
      } catch (err) {
        this.fetchedAt = Math.max(this.fetchedAt, this.now() - JWKS_TTL_MS + JWKS_REFETCH_MS);
        if (err instanceof InvalidSession) throw err;
        throw new InvalidSession("the project's keys could not be fetched");
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
}
