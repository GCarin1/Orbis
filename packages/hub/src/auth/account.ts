// Who may use the hub (change 0064-account-sign-in, specs/hub-api): the hub's own token, or the session of
// the one Orbis account linked to this hub (an email and a password, through Supabase Auth). The event
// stream opens with a one-time ticket and a file's content with a short file key, so neither the token nor
// a session ever travels in an address.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { AccountStatus, AuthConfig } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { HttpError, unauthorized } from "../errors.js";
import type { SettingsRepo } from "../repos/settings.js";
import { AccountTokens, InvalidSession, looksLikeJwt } from "./jwt.js";

/** How a request proved who it is. */
export type Via = "token" | "account";

export const TICKET_TTL_MS = 60_000;
export const MAX_TICKETS = 100;
export const FILE_KEY_TTL_MS = 60 * 60_000;
/** Refused credentials from one address in a minute before it must wait. */
export const FAILURES_PER_MINUTE = 20;

const ACCOUNT_KEY = "account";

interface Linked {
  userId: string;
  email: string | null;
  linkedAt: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}

export class HubAuth {
  readonly tokens: AccountTokens | null;
  private readonly via = new WeakMap<FastifyRequest, Via>();
  private readonly tickets = new Map<string, number>();
  private readonly fileSecret = randomBytes(32);
  private readonly failures = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(
    private readonly config: HubConfig,
    private readonly settings: SettingsRepo,
    opts: { fetch?: typeof fetch; now?: () => number } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.tokens = config.supabase ? new AccountTokens(config.supabase.url, opts.fetch, this.now) : null;
  }

  linked(): Linked | null {
    const raw = this.settings.get(ACCOUNT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Linked;
    } catch {
      return null;
    }
  }

  /** Link this hub to an account (its sessions open it from then on). */
  setLinked(userId: string, email: string | null): void {
    this.settings.set(ACCOUNT_KEY, JSON.stringify({ userId, email, linkedAt: new Date(this.now()).toISOString() } satisfies Linked));
  }

  /** How the request proved itself, once the auth hook let it through. */
  viaOf(req: FastifyRequest): Via | null {
    return this.via.get(req) ?? null;
  }

  /** Check a bearer value: the hub token, or a session of the linked account. */
  async check(presented: string | null): Promise<Via | null> {
    if (!presented) return null;
    if (safeEqual(presented, this.config.token)) return "token";
    const linked = this.linked();
    if (!linked || !this.tokens || !looksLikeJwt(presented)) return null;
    try {
      const claims = await this.tokens.verify(presented);
      return claims.userId === linked.userId ? "account" : null;
    } catch (err) {
      if (err instanceof InvalidSession) return null;
      throw err;
    }
  }

  /** The auth hook's verdict on a request that needs it (server.ts). */
  async authenticate(req: FastifyRequest, mode: "bearer" | "stream" | "file"): Promise<Via> {
    const ip = req.ip;
    let via: Via | null = null;
    const query = new URL(req.url, "http://x").searchParams;
    if (mode === "stream" && query.has("ticket")) via = this.useTicket(query.get("ticket")!);
    else if (mode === "file" && query.has("key")) via = this.fileKeyHolds(query.get("key")!) ? "token" : null;
    else via = await this.check(bearer(req));
    if (!via) {
      // Valid credentials always pass, so a stranger's tries never lock the owner out (a tunnel gives every
      // visitor one address); past the limit a refusal says to wait instead.
      if (this.tooManyFailures(ip)) throw new HttpError(429, "too_many_failures", "too many refused sign-ins from this address: wait a minute");
      this.fail(ip);
      throw unauthorized();
    }
    this.via.set(req, via);
    return via;
  }

  /** A ticket that opens the event stream once, within a minute. */
  issueTicket(via: Via): { ticket: string; expiresAt: string } {
    const at = this.now();
    for (const [t, exp] of this.tickets) if (exp <= at) this.tickets.delete(t);
    if (this.tickets.size >= MAX_TICKETS) throw new HttpError(429, "too_many_tickets", "too many stream tickets waiting: open the ones asked for first");
    const ticket = `${via === "account" ? "a" : "t"}_${randomBytes(24).toString("base64url")}`;
    this.tickets.set(ticket, at + TICKET_TTL_MS);
    return { ticket, expiresAt: new Date(at + TICKET_TTL_MS).toISOString() };
  }

  private useTicket(ticket: string): Via | null {
    const exp = this.tickets.get(ticket);
    if (exp === undefined) return null;
    this.tickets.delete(ticket);
    if (exp <= this.now()) return null;
    return ticket.startsWith("a_") ? "account" : "token";
  }

  /** A key that opens the content of the hub's files (and nothing else) for an hour. */
  issueFileKey(): { key: string; expiresAt: string } {
    const exp = this.now() + FILE_KEY_TTL_MS;
    return { key: `${exp.toString(36)}.${this.sign(exp)}`, expiresAt: new Date(exp).toISOString() };
  }

  private fileKeyHolds(key: string): boolean {
    const m = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]{43})$/.exec(key);
    if (!m) return false;
    const exp = parseInt(m[1]!, 36);
    return exp > this.now() && safeEqual(m[2]!, this.sign(exp));
  }

  private sign(exp: number): string {
    return createHmac("sha256", this.fileSecret).update(`files:${exp}`).digest("base64url");
  }

  private tooManyFailures(ip: string): boolean {
    const at = this.now();
    const list = (this.failures.get(ip) ?? []).filter((t) => at - t < 60_000);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list.length >= FAILURES_PER_MINUTE;
  }

  private fail(ip: string): void {
    const list = this.failures.get(ip) ?? [];
    list.push(this.now());
    this.failures.set(ip, list);
    // A hub seeing many addresses keeps the map small.
    if (this.failures.size > 10_000) this.failures.clear();
  }

  status(via: Via | null): AccountStatus {
    const linked = this.linked();
    return { available: Boolean(this.tokens), linked: linked ? { userId: linked.userId, email: linked.email, linkedAt: linked.linkedAt } : null, via };
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    // Before signing in: where the sign-in goes, and whether an account opens this hub (never which one).
    app.get("/api/v1/auth/config", { schema: { tags: ["account"], security: [] } }, async (): Promise<AuthConfig> => ({
      supabase: this.config.supabase,
      linked: this.linked() !== null,
    }));
    app.get("/api/v1/account", { schema: { tags: ["account"] } }, async (req): Promise<AccountStatus> => this.status(this.viaOf(req)));
    app.post(
      "/api/v1/account/link",
      { schema: { tags: ["account"], body: Type.Object({ accessToken: Type.String({ minLength: 20, maxLength: 8192 }) }, { additionalProperties: false }) } },
      async (req): Promise<AccountStatus> => {
        // Only the hub's own token links an account: a session alone never takes a hub.
        if (this.viaOf(req) !== "token") throw new HttpError(403, "token_required", "link an account while signed in to the hub with its token");
        if (!this.tokens) throw new HttpError(409, "accounts_off", "this hub has no account sign-in (ORBIS_SUPABASE_URL is off)");
        let claims;
        try {
          claims = await this.tokens.verify(req.body.accessToken);
        } catch (err) {
          if (err instanceof InvalidSession) throw new HttpError(400, "invalid_session", `the account's session does not hold: ${err.message}`, { accessToken: err.message });
          throw err;
        }
        this.setLinked(claims.userId, claims.email);
        return this.status("token");
      },
    );
    app.delete("/api/v1/account", { schema: { tags: ["account"] } }, async (req): Promise<AccountStatus> => {
      this.settings.delete(ACCOUNT_KEY);
      return this.status(this.viaOf(req));
    });
    app.post("/api/v1/stream/ticket", { schema: { tags: ["stream"] } }, async (req) => this.issueTicket(this.viaOf(req) ?? "token"));
    app.post("/api/v1/files/key", { schema: { tags: ["files"] } }, async () => this.issueFileKey());
  }
}
