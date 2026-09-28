// One timeline (specs/web-app): the user's messages on the right, the bots' on
// the left, time separators, "Messages from …" when colleagues speak in a bot's
// own conversation, mentions in each bot's color, cards, events and each run's
// steps, collapsible.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { resolveMentions, type Bot, type Step, type TimelineItem } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";
import type { RunView } from "../store.js";
import { canSpeak, speak } from "../voice.js";
import { Avatar, BotFace } from "./Avatar.js";
import { CardView } from "./Cards.js";
import { SpeakerIcon } from "./Icons.js";

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);
/** A pause this long starts a new time separator. */
const GAP_MS = 20 * 60_000;
const MENTION = /(^|[^a-z0-9_@.-])(@[a-z0-9-]{2,32})(?![a-z0-9-])/gi;

function StepLine({ step }: { step: Step }) {
  switch (step.type) {
    case "thinking":
      return <li className="step step-thinking">💭 {step.text}</li>;
    case "tool_call":
      return (
        <li className="step step-call">
          → <code>{step.tool}</code> <span className="muted">{JSON.stringify(step.input ?? {}).slice(0, 200)}</span>
        </li>
      );
    case "tool_result":
      return <li className={`step step-result${step.isError ? " step-error" : ""}`}>← {(step.output ?? "").slice(0, 400)}</li>;
    case "text":
      return null;
  }
}

export function Steps({ run, open: initiallyOpen = false }: { run: RunView; open?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(initiallyOpen);
  const visible = run.steps.filter((s) => s.type !== "text");
  if (visible.length === 0) return null;
  return (
    <div className="steps">
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? t("steps.hide") : t("steps.show", { count: visible.length })}
      </button>
      {open && (
        <ol className="step-list">
          {visible.map((s, i) => (
            <StepLine key={i} step={s} />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Text with each `@handle` or `@role` of the team drawn in that bot's color, with its face. */
export function RichText({ text, bots }: { text: string; bots: Bot[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const token = m[2]!;
    const start = m.index! + m[1]!.length;
    const [bot] = resolveMentions([token.slice(1).toLowerCase()], bots);
    if (!bot) continue;
    out.push(text.slice(last, start));
    out.push(
      <span key={start} className="mention" style={{ color: bot.avatar.color }} title={`${bot.name}${bot.role ? ` — ${bot.role}` : ""}`}>
        <BotFace shape={bot.avatar.shape} color={bot.avatar.color} size={14} />
        {token}
      </span>,
    );
    last = start + token.length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function separatorLabel(iso: string, lang: string, yesterday: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `${yesterday} ${time}`;
  return `${d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** Names joined as "A", "A and B", "A, B and C". */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}

export function Timeline({
  items,
  bots,
  runs,
  activeRuns,
  ownBotId = null,
}: {
  items: TimelineItem[];
  bots: Record<string, Bot>;
  runs: Record<string, RunView>;
  activeRuns: RunView[];
  /** The bot whose own conversation this is; null for a group. */
  ownBotId?: string | null;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const end = useRef<HTMLDivElement>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const team = Object.values(bots);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [items.length, activeRuns.length]);

  const fromOther = (item: TimelineItem | undefined) =>
    item !== undefined && item.author.type === "bot" && ownBotId !== null && item.author.id !== ownBotId && item.kind !== "event";

  return (
    <div className="timeline" role="log" aria-live="polite">
      {items.map((item, index) => {
        const prev = items[index - 1];
        const parts: ReactNode[] = [];
        if (!prev || new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime() > GAP_MS) {
          parts.push(
            <div key="time" className="time-sep">
              {separatorLabel(item.createdAt, lang, t("time.yesterday"))}
            </div>,
          );
        }
        // Colleagues speaking in a bot's own conversation: say who, once per stretch.
        if (fromOther(item) && !fromOther(prev)) {
          const authors: Bot[] = [];
          for (let j = index; j < items.length && fromOther(items[j]); j++) {
            const b = bots[items[j]!.author.id ?? ""];
            if (b && !authors.includes(b)) authors.push(b);
          }
          if (authors.length) {
            parts.push(
              <div key="from" className="from-sep" data-testid="messages-from">
                {t("timeline.messagesFrom")}{" "}
                {authors.map((b, i) => (
                  <Fragment key={b.id}>
                    {i > 0 && (i === authors.length - 1 ? ` ${t("timeline.and")} ` : ", ")}
                    <span className="from-name" style={{ color: b.avatar.color }}>
                      <BotFace shape={b.avatar.shape} color={b.avatar.color} size={14} />
                      {b.name}
                    </span>
                  </Fragment>
                ))}
              </div>,
            );
          }
        }

        if (item.kind === "event") {
          parts.push(
            <div key="item" className={`event event-${item.event?.type ?? "info"}`} data-testid="event">
              {item.text}
            </div>,
          );
        } else if (item.kind === "card") {
          parts.push(<CardView key="item" item={item} bot={bots[item.author.id ?? ""]} bots={bots} />);
        } else {
          const bot = item.author.type === "bot" ? bots[item.author.id ?? ""] : undefined;
          const mine = item.author.type === "user";
          const run = item.runId ? runs[item.runId] : undefined;
          const parent = item.parentId ? byId.get(item.parentId) : undefined;
          const sameAuthor = prev?.kind === "message" && prev.author.type === item.author.type && prev.author.id === item.author.id && parts.length === 0;
          const showWho = !mine && bot && (ownBotId === null || bot.id !== ownBotId) && !sameAuthor;
          const reactions = Object.entries(item.reactions ?? {}).filter(([, count]) => count > 0);
          parts.push(
            <div
              key="item"
              className={`message ${mine ? "message-user" : "message-bot"}${bot && bot.id === ownBotId ? " own" : ""}${sameAuthor ? " continued" : ""}`}
              data-testid="message"
            >
              {!mine && <span className="message-face">{showWho && bot ? <Avatar bot={bot} size={28} /> : null}</span>}
              <div className="bubble-wrap">
                {showWho && bot && (
                  <div className="bubble-author" style={{ color: bot.avatar.color }}>
                    {bot.name}
                  </div>
                )}
                <div className="bubble" title={new Date(item.createdAt).toLocaleString(lang)}>
                  {parent && (
                    <div className="reply-to" data-testid="reply-to">
                      ↪ {t("thread.replyTo", { text: clip(parent.text, 80) })}
                    </div>
                  )}
                  <div className="bubble-text">
                    <RichText text={item.text} bots={team} />
                  </div>
                  {reactions.length > 0 && (
                    <span className="reactions">
                      {reactions.map(([emoji, count]) => (
                        <span key={emoji} className="reaction">
                          {emoji}
                          {count > 1 ? ` ${count}` : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {!mine && canSpeak() && (
                  <button
                    type="button"
                    className="bubble-listen"
                    aria-label={t("voice.listen")}
                    title={t("voice.listen")}
                    onClick={() => speak(item.text, lang)}
                  >
                    <SpeakerIcon size={14} />
                  </button>
                )}
                {run && <Steps run={run} />}
              </div>
            </div>,
          );
        }
        return <Fragment key={item.id}>{parts}</Fragment>;
      })}
      {activeRuns.map((run) => {
        const bot = bots[run.botId];
        return (
          <div key={run.id} className="message message-bot working" data-testid="working">
            <span className="message-face">{bot && <Avatar bot={bot} size={28} />}</span>
            <div className="bubble-wrap">
              <div className="bubble typing" aria-label={t("steps.running", { name: bot?.name ?? "bot" })}>
                <span className="sr-only">{t("steps.running", { name: bot?.name ?? "bot" })}</span>
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <Steps run={run} open />
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
