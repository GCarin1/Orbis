// Orbis accounts (change 0064-account-sign-in, specs/web-app): signing in with an email and a password, creating
// an account, resetting a password, through Supabase Auth's REST API; the session is kept on this device and
// renewed before it ends. The hub takes the session of the account linked to it like its own token.
import type { AuthConfig } from "@orbis/shared";

const SESSION_KEY = "orbis.session";
/** A session is renewed when it has less than this left. */
export const RENEW_BEFORE_MS = 60_000;
/** The shortest password an account may have (the project asks the same). */
export const MIN_PASSWORD = 10;

export type Project = NonNullable<AuthConfig["supabase"]>;

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working, in milliseconds since 1970. */
  expiresAt: number;
  user: { id: string; email: string | null };
}

/** What Supabase Auth answered when it refused: its own words, and its code when it gives one. */
export class AccountError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
    public readonly status = 0,
  ) {
    super(message);
  }
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: { id: string; email?: string | null } };

async function call<T>(project: Project, method: string, path: string, body?: unknown, accessToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${project.url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: project.key,
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new AccountError("the sign-in service cannot be reached", "network");
  }
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const message = String(parsed.msg ?? parsed.error_description ?? parsed.message ?? parsed.error ?? `HTTP ${res.status}`);
    throw new AccountError(message, (parsed.error_code as string | undefined) ?? (parsed.error as string | undefined) ?? null, res.status);
  }
  return parsed as T;
}

function toSession(answer: TokenAnswer, now = Date.now()): Session {
  if (!answer.access_token || !answer.refresh_token || !answer.user) throw new AccountError("the sign-in service gave no session");
  const expiresAt = answer.expires_at ? answer.expires_at * 1000 : now + (answer.expires_in ?? 3600) * 1000;
  return { accessToken: answer.access_token, refreshToken: answer.refresh_token, expiresAt, user: { id: answer.user.id, email: answer.user.email ?? null } };
}

/** The project accounts sign in with, as the hub says; null when it has none. */
export async function authConfig(base = ""): Promise<AuthConfig | null> {
  try {
    const res = await fetch(`${base}/api/v1/auth/config`);
    return res.ok ? ((await res.json()) as AuthConfig) : null;
  } catch {
    return null;
  }
}

export async function signIn(project: Project, email: string, password: string): Promise<Session> {
  return toSession(await call<TokenAnswer>(project, "POST", "/token?grant_type=password", { email: email.trim(), password }));
}

/** A new account; with email confirmation on, no session yet: the user confirms from their email first. */
export async function signUp(project: Project, email: string, password: string, redirectTo: string): Promise<Session | null> {
  if (password.length < MIN_PASSWORD) throw new AccountError(`the password needs at least ${MIN_PASSWORD} characters`, "weak_password");
  const answer = await call<TokenAnswer>(project, "POST", `/signup?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim(), password });
  return answer.access_token ? toSession(answer) : null;
}

/** Email a link that signs in to choose a new password; it opens `redirectTo`. */
export async function recover(project: Project, email: string, redirectTo: string): Promise<void> {
  await call(project, "POST", `/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim() });
}

export async function updatePassword(project: Project, session: Session, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new AccountError(`the password needs at least ${MIN_PASSWORD} characters`, "weak_password");
  await call(project, "PUT", "/user", { password }, session.accessToken);
}

export async function refresh(project: Project, session: Session): Promise<Session> {
  return toSession(await call<TokenAnswer>(project, "POST", "/token?grant_type=refresh_token", { refresh_token: session.refreshToken }));
}

/** End the session at Supabase too (its refresh token stops working). */
export async function signOut(project: Project, session: Session): Promise<void> {
  await call(project, "POST", "/logout?scope=local", {}, session.accessToken).catch(() => undefined);
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * What an email's link brought in the address fragment: a session for choosing a new password
 * (`type=recovery`) or after confirming an account (`type=signup`), or the error it ended with. The
 * fragment is removed from the address bar at once.
 */
export function captureAuthFromUrl(): { type: string; session: Session | null; error: string | null } | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!/(?:^|&)(access_token|error_description|error)=/.test(hash)) return null;
  const q = new URLSearchParams(hash);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  const error = q.get("error_description") ?? q.get("error");
  if (error) return { type: q.get("type") ?? "error", session: null, error };
  const token = q.get("access_token");
  const refreshToken = q.get("refresh_token");
  if (!token || !refreshToken) return null;
  // The user is in the token itself; the hub checks its signature, this only reads who it is.
  let user = { id: "", email: null as string | null };
  try {
    const claims = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string; email?: string };
    user = { id: claims.sub ?? "", email: claims.email ?? null };
  } catch {
    /* an unreadable token fails at the hub */
  }
  const expiresAt = q.get("expires_at") ? Number(q.get("expires_at")) * 1000 : Date.now() + Number(q.get("expires_in") ?? 3600) * 1000;
  return { type: q.get("type") ?? "magiclink", session: { accessToken: token, refreshToken, expiresAt, user }, error: null };
}

/**
 * The signed-in account on this device: gives a working access token, renewing the session before it ends
 * (one renewal at a time), and calls `onEnded` when it cannot be renewed.
 */
export class AccountSession {
  private renewing: Promise<Session> | null = null;

  constructor(
    readonly project: Project,
    private session: Session,
    private readonly onEnded: () => void = () => undefined,
    private readonly now: () => number = Date.now,
  ) {}

  get user(): Session["user"] {
    return this.session.user;
  }

  current(): Session {
    return this.session;
  }

  /** An access token with more than RENEW_BEFORE_MS left. */
  token = async (): Promise<string> => {
    if (this.session.expiresAt - this.now() > RENEW_BEFORE_MS) return this.session.accessToken;
    this.renewing ??= refresh(this.project, this.session)
      .then((next) => {
        this.session = next;
        saveSession(next);
        return next;
      })
      .catch((err: unknown) => {
        // A refresh token refused (signed out elsewhere, revoked): the session is over.
        if (err instanceof AccountError && err.status >= 400 && err.status < 500) {
          saveSession(null);
          this.onEnded();
        }
        throw err;
      })
      .finally(() => {
        this.renewing = null;
      });
    return (await this.renewing).accessToken;
  };

  async signOut(): Promise<void> {
    saveSession(null);
    await signOut(this.project, this.session);
  }
}
