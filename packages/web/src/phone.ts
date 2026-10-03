// The phone's notifications (specs/android-app): what happens while the Android app is in the background,
// as a chat app shows it — a bot's reply, a bot asking for an approval or a secret, a manager reporting back.
// One notification per conversation (the latest replaces the one before); a muted group's messages and
// reports raise none, its approval and secret requests do (a bot is waiting on the user).
import type { Approval, Bot, Conversation, StreamEvent, TimelineItem } from "@orbis/shared";
import { plainText } from "./components/Markdown.js";
import { translate, useLang, type TextKey } from "./i18n.js";
import { androidApp } from "./native.js";

export interface PhoneNote {
  /** A notification with the same tag replaces this one. */
  tag: string;
  title: string;
  body: string;
  conversationId: string;
}

export interface PhoneContext {
  bots: Record<string, Bot>;
  conversations: Record<string, Conversation>;
}

type T = (key: TextKey, vars?: Record<string, string | number>) => string;

const clip = (text: string, n = 280) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function phoneNote(event: StreamEvent, ctx: PhoneContext, t: T): PhoneNote | null {
  const name = (botId: string | null | undefined) => ctx.bots[botId ?? ""]?.name ?? t("phone.aBot");
  const muted = (conversationId: string) => ctx.conversations[conversationId]?.muted === true;
  if (event.type === "approval.requested") {
    const approval = (event.data as { approval: Approval }).approval;
    if (approval.status !== "pending") return null;
    return {
      tag: `approval:${approval.id}`,
      title: t("phone.approval", { name: name(approval.botId), tool: approval.tool }),
      body: clip(approval.reason || t("phone.approvalBody")),
      conversationId: approval.conversationId ?? "",
    };
  }
  if (event.type === "bot.report") {
    const report = event.data as { botId: string; conversationId: string; text: string };
    if (muted(report.conversationId)) return null;
    return {
      tag: `conv:${report.conversationId}`,
      title: t("phone.report", { name: name(report.botId) }),
      body: clip(plainText(report.text)),
      conversationId: report.conversationId,
    };
  }
  if (event.type === "timeline.item") {
    const { conversationId, item } = event.data as { conversationId: string; item: TimelineItem };
    if (item.card?.type === "secret-request" && item.card.state === "pending") {
      const data = item.card.data as { name?: string; reason?: string; botId?: string };
      return {
        tag: `secret:${item.id}`,
        title: t("phone.secret", { name: name(data.botId ?? item.author.id), secret: data.name ?? "" }),
        body: clip(data.reason ?? ""),
        conversationId,
      };
    }
    if (item.kind !== "message" || item.author.type !== "bot" || !item.text.trim() || muted(conversationId)) return null;
    const group = ctx.conversations[conversationId];
    const who = name(item.author.id);
    return {
      tag: `conv:${conversationId}`,
      title: group?.kind === "group" ? `${who} · ${group.title}` : who,
      body: clip(plainText(item.text)),
      conversationId,
    };
  }
  return null;
}

/** Hand an event to the Android app as a notification, when the app can show one and is not on screen. */
export function notifyPhone(event: StreamEvent, ctx: PhoneContext): void {
  const android = androidApp();
  if (typeof android?.notify !== "function" || document.visibilityState !== "hidden") return;
  const lang = useLang.getState().lang;
  const note = phoneNote(event, ctx, (key, vars) => translate(lang, key, vars));
  if (note) android.notify(note.tag, note.title, note.body, note.conversationId);
}
