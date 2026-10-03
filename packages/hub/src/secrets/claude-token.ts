// The Claude subscription's long-lived token (specs/agent-runtimes, specs/secrets, ADR 0017): the
// token `claude setup-token` prints once on any computer signed in to a Claude plan. Kept encrypted with
// the hub's secrets and handed to Claude Code alone as CLAUDE_CODE_OAUTH_TOKEN, so a hub on a server —
// a Codespace, a small VM — runs its `claude-code` bots on the plan's limits and never on the API.
import { CLAUDE_OAUTH_TOKEN, type ClaudeTokenStatus } from "@orbis/shared";
import type { SettingsRepo } from "../repos/settings.js";
import type { HubSecrets } from "./hub-secrets.js";

/** The hub secret that holds the token. */
const SECRET = "claude-subscription-token";
const SAVED_AT = "claude.tokenSavedAt";
/** `claude setup-token` makes a token for one year. */
export const TOKEN_LIFETIME_DAYS = 365;

export class ClaudeTokenError extends Error {}

/**
 * The token out of whatever was pasted: the bare token, a `CLAUDE_CODE_OAUTH_TOKEN=…` or `export …`
 * line, quoted, or wrapped over lines by the terminal. An API key is refused: it would bill the API.
 */
export function cleanClaudeToken(text: string): string {
  let token = text.trim().replace(/^export\s+/i, "");
  token = token.replace(new RegExp(`^${CLAUDE_OAUTH_TOKEN}\\s*=\\s*`), "");
  token = token.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  if (!token) throw new ClaudeTokenError("paste the token that `claude setup-token` prints");
  if (/^sk-ant-api/i.test(token))
    throw new ClaudeTokenError(
      "this is an API key, which bills the Claude API: run `claude setup-token` and paste the token it prints (sk-ant-oat…), which uses your plan",
    );
  if (token.length < 20 || /[^A-Za-z0-9_\-.~+/=]/.test(token))
    throw new ClaudeTokenError("this does not look like the token `claude setup-token` prints (sk-ant-oat…)");
  return token;
}

export class ClaudeSubscriptionToken {
  /** The saved token, read once (it is also what run output is masked with). */
  private saved: string | null | undefined;

  /** `serverToken`: CLAUDE_CODE_OAUTH_TOKEN of the hub's environment, if set. */
  constructor(
    private readonly secrets: HubSecrets,
    private readonly settings: SettingsRepo,
    private readonly serverToken: string | null = null,
  ) {}

  private stored(): string | null {
    if (this.saved === undefined) this.saved = this.secrets.get(SECRET);
    return this.saved;
  }

  private server(): string | null {
    return this.serverToken?.trim() || null;
  }

  /** The token Claude Code gets: the one saved in Orbis, else the hub environment's. */
  get(): { token: string; source: "saved" | "server" } | null {
    const saved = this.stored();
    if (saved) return { token: saved, source: "saved" };
    const server = this.server();
    return server ? { token: server, source: "server" } : null;
  }

  /** The variable for a Claude Code process, or nothing (it then uses its own sign-in). */
  env(): Record<string, string> {
    const found = this.get();
    return found ? { [CLAUDE_OAUTH_TOKEN]: found.token } : {};
  }

  /** Every token value the hub knows, to mask in what runs store or show. */
  known(): string[] {
    return [this.stored(), this.server()].filter((v): v is string => !!v);
  }

  set(text: string, now: Date = new Date()): ClaudeTokenStatus {
    const token = cleanClaudeToken(text);
    this.secrets.set(SECRET, token);
    this.settings.set(SAVED_AT, now.toISOString());
    this.saved = token;
    return this.status();
  }

  clear(): ClaudeTokenStatus {
    this.secrets.delete(SECRET);
    this.settings.delete(SAVED_AT);
    this.saved = null;
    return this.status();
  }

  status(): ClaudeTokenStatus {
    const found = this.get();
    const savedAt = found?.source === "saved" ? this.settings.get(SAVED_AT) : null;
    const expires = savedAt ? new Date(new Date(savedAt).getTime() + TOKEN_LIFETIME_DAYS * 86_400_000).toISOString() : null;
    return { saved: found !== null, source: found?.source ?? null, savedAt, expiresAround: expires };
  }
}
