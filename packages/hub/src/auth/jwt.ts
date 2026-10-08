// The session tokens of Supabase Auth (change 0064-account-sign-in, specs/hub-api): a JSON Web Token the
// project signs with its private key and anyone checks with the public keys it publishes (JWKS). The hub
// keeps no shared secret: it fetches those keys, and takes a token only when its signature, issuer,
// audience, role and lifetime hold.
import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";

/** How long the published keys are trusted before they are fetched again. */
export const JWKS_TTL_MS = 10 * 60_000;
/** An unknown key id fetches the keys again (a rotation), at most this often. */
export const JWKS_REFETCH_MS = 30_000;
/** The clocks of the hub and of Supabase may disagree by this much. */
export const CLOCK_SKEW_S = 30;

export interface AccountClaims {
  /** The account's id (auth.users.id). */
  userId: string;
  email: string | null;
  /** When the token stops working, in seconds since 1970. */
  exp: number;
}

export class InvalidSession extends Error {}

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function part<T>(segment: string, what: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new InvalidSession(`the token's ${what} is not JSON`);
  }
}

/** Whether a bearer value has the shape of a JWT (three base64url parts), so it is worth verifying. */
export const looksLikeJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

export class AccountTokens {
  private keys = new Map<string, { key: KeyObject; alg: string }>();
  private fetchedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly projectUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  get issuer(): string {
    return `${this.projectUrl}/auth/v1`;
  }

  /** The account a session token belongs to; throws InvalidSession for any token that does not hold. */
  async verify(token: string): Promise<AccountClaims> {
    if (!looksLikeJwt(token)) throw new InvalidSession("not a session token");
    const [h, p, s] = token.split(".") as [string, string, string];
    const header = part<{ alg?: string; kid?: string; typ?: string }>(h, "header");
    // Only the asymmetric algorithms Supabase signs with: never "none" nor a shared-secret HS256.
    if (header.alg !== "ES256" && header.alg !== "RS256") throw new InvalidSession(`the token is signed with ${header.alg ?? "nothing"}`);
    if (!header.kid) throw new InvalidSession("the token names no key");
    const found = await this.key(header.kid);
    if (!found || found.alg !== header.alg) throw new InvalidSession("the token's key is not the project's");
    const data = Buffer.from(`${h}.${p}`);
    const signature = Buffer.from(s, "base64url");
    const ok =
      header.alg === "ES256"
        ? verify("sha256", data, { key: found.key, dsaEncoding: "ieee-p1363" }, signature)
        : verify("sha256", data, found.key, signature);
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

  private async key(kid: string): Promise<{ key: KeyObject; alg: string } | undefined> {
    const at = this.now();
    const stale = at - this.fetchedAt > JWKS_TTL_MS;
    const unknown = !this.keys.has(kid) && at - this.fetchedAt > JWKS_REFETCH_MS;
    if (stale || unknown) await this.load();
    return this.keys.get(kid);
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const res = await this.fetcher(`${this.issuer}/.well-known/jwks.json`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new InvalidSession(`the project's keys answered HTTP ${res.status}`);
        const body = (await res.json()) as { keys?: Jwk[] };
        const keys = new Map<string, { key: KeyObject; alg: string }>();
        for (const jwk of body.keys ?? []) {
          if (!jwk.kid || (jwk.use && jwk.use !== "sig")) continue;
          const alg = jwk.alg ?? (jwk.kty === "EC" ? "ES256" : jwk.kty === "RSA" ? "RS256" : "");
          if (alg !== "ES256" && alg !== "RS256") continue;
          try {
            keys.set(jwk.kid, { key: createPublicKey({ key: jwk, format: "jwk" }), alg });
          } catch {
            /* a key Node cannot read is skipped */
          }
        }
        this.keys = keys;
        this.fetchedAt = this.now();
      } catch (err) {
        // A failed fetch keeps the keys known and waits before trying again.
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
