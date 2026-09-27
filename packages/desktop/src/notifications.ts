// Native notifications for what needs the user (specs/desktop-app): an approval
// request, a new secret request. One notification per request, carrying the
// conversation a click should open.
import type { Approval, Bot, StreamEvent, TimelineItem } from "@orbis/shared";

export interface DesktopNotification {
  /** A stable id: the approval or the card item. */
  id: string;
  title: string;
  body: string;
  conversationId: string | null;
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

export class NotificationCenter {
  private readonly seen = new Set<string>();

  constructor(private readonly botName: (botId: string) => string | undefined = () => undefined) {}

  /** The notification an event deserves, or null (already shown, or nothing to ask). */
  fromEvent(event: StreamEvent): DesktopNotification | null {
    const note = this.map(event);
    if (!note || this.seen.has(note.id)) return null;
    this.seen.add(note.id);
    return note;
  }

  private map(event: StreamEvent): DesktopNotification | null {
    if (event.type === "approval.requested") {
      const approval = (event.data as { approval: Approval }).approval;
      if (approval.status !== "pending") return null;
      const name = this.botName(approval.botId) ?? "A bot";
      return {
        id: approval.id,
        title: `${name} asks to use ${approval.tool}`,
        body: approval.reason ? clip(approval.reason) : "Allow once, always, or deny in Orbis.",
        conversationId: approval.conversationId,
      };
    }
    if (event.type === "timeline.item") {
      const { conversationId, item } = event.data as { conversationId: string; item: TimelineItem };
      if (item.card?.type !== "secret-request" || item.card.state !== "pending") return null;
      const data = item.card.data as { name?: string; reason?: string; botId?: string };
      const name = (data.botId && this.botName(data.botId)) ?? "A bot";
      return {
        id: item.id,
        title: `${name} asks for the secret ${data.name ?? ""}`.trim(),
        body: data.reason ? clip(data.reason) : "Type it into the masked field in Orbis.",
        conversationId,
      };
    }
    return null;
  }
}

/** Keep bot names current for the titles. */
export function botDirectory(): { name(botId: string): string | undefined; apply(event: StreamEvent): void; set(bots: Bot[]): void } {
  const names = new Map<string, string>();
  return {
    name: (id) => names.get(id),
    set: (bots) => bots.forEach((b) => names.set(b.id, b.name)),
    apply: (event) => {
      if (event.type === "bot.updated") {
        const bot = (event.data as { bot: Bot }).bot;
        names.set(bot.id, bot.name);
      }
    },
  };
}
