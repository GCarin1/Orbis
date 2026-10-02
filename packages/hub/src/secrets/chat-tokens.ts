// The Bearer token shared by every chat-http bot of one chat API (specs/secrets, specs/agent-runtimes):
// one token per API origin, kept encrypted with the hub's secrets, so that a token that expired is
// changed once — in Settings → Brains, or in any of those bots' settings — for every bot of that API.
import {
  CHAT_HTTP_SHARED_TOKEN,
  CHAT_HTTP_TOKEN_SECRET,
  chatApiOrigin,
  cleanBearer,
  tokenExpiry,
  type Bot,
  type ChatTokenGroup,
  type ChatTokenStatus,
} from "@orbis/shared";
import type { HubSecrets } from "./hub-secrets.js";

export const sharedTokenName = (origin: string) => `${CHAT_HTTP_SHARED_TOKEN}${origin}`;

export function tokenStatus(token: string | null, source: ChatTokenStatus["source"]): ChatTokenStatus {
  const value = cleanBearer(token ?? "");
  const expires = value ? tokenExpiry(value) : null;
  return {
    saved: value !== "",
    expiresAt: expires?.toISOString() ?? null,
    expired: expires !== null && expires.getTime() <= Date.now(),
    source: value ? source : null,
  };
}

export class ChatTokens {
  /** The tokens read or written while the hub runs, by origin (also what run output is masked with). */
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly secrets: HubSecrets) {}

  get(origin: string): string | null {
    if (!this.cache.has(origin)) this.cache.set(origin, this.secrets.get(sharedTokenName(origin)));
    return this.cache.get(origin)!;
  }

  set(origin: string, token: string): void {
    this.secrets.set(sharedTokenName(origin), token);
    this.cache.set(origin, token);
  }

  /** The shared tokens known so far, to mask in anything a run stores or shows. */
  known(): string[] {
    return [...this.cache.values()].filter((v): v is string => !!v);
  }

  /** The chat APIs the chat-http bots use, each with its shared token's status and its bots. */
  groups(bots: Bot[]): ChatTokenGroup[] {
    const byOrigin = new Map<string, ChatTokenGroup["bots"]>();
    for (const bot of bots) {
      if (bot.brain.kind !== "chat-http") continue;
      const origin = chatApiOrigin(bot.brain.baseUrl);
      if (!origin) continue;
      byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), { id: bot.id, name: bot.name, handle: bot.handle }]);
    }
    return [...byOrigin.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([origin, list]) => ({ origin, token: tokenStatus(this.get(origin), "shared"), bots: list }));
  }

  /** The token a bot uses: its chat API's shared one, else its own (a bot set up before tokens were shared). */
  tokenFor(bot: Bot, own: (name: string) => string | null): { token: string; source: "shared" | "bot" } | null {
    const origin = chatApiOrigin(bot.brain.baseUrl);
    const shared = cleanBearer((origin && this.get(origin)) || "");
    if (shared) return { token: shared, source: "shared" };
    const mine = cleanBearer(own(bot.brain.apiKeySecret || CHAT_HTTP_TOKEN_SECRET) ?? "");
    return mine ? { token: mine, source: "bot" } : null;
  }
}
