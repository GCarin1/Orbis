// Native notifications for what needs the user (specs/desktop-app): an approval
// request, a new secret request, a manager reporting what its team finished.
// One notification per request or report, carrying the conversation a click
// should open. A muted group's reports raise none; a bot waiting on the user does.
import type { Approval, Bot, Conversation, StreamEvent, TimelineItem } from "@orbis/shared";

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

  constructor(
    private readonly botName: (botId: string) => string | undefined = () => undefined,
    /** Whether the user muted this conversation (its reports raise no notification). */
    private readonly muted: (conversationId: string) => boolean = () => false,
  ) {}

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
    if (event.type === "bot.report") {
      // A manager came back on its own with what its team finished.
      const report = event.data as { botId: string; conversationId: string; itemId: string; text: string };
      if (this.muted(report.conversationId)) return null;
      return {
        id: report.itemId,
        title: `${this.botName(report.botId) ?? "A bot"} reported back`,
        body: clip(report.text),
        conversationId: report.conversationId,
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

/** Which conversations the user muted, kept current from the stream. */
export function mutedConversations(): { has(conversationId: string): boolean; apply(event: StreamEvent): void; set(conversations: Conversation[]): void } {
  const muted = new Set<string>();
  const put = (c: Conversation) => (c.muted ? muted.add(c.id) : muted.delete(c.id));
  return {
    has: (id) => muted.has(id),
    set: (conversations) => conversations.forEach(put),
    apply: (event) => {
      if (event.type === "conversation.updated") put((event.data as { conversation: Conversation }).conversation);
      if (event.type === "conversation.deleted") muted.delete((event.data as { conversationId: string }).conversationId);
    },
  };
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
