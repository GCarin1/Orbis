// One timeline (specs/web-app): the user's messages on the right, the bots' on
// the left, time separators, "Messages from …" when colleagues speak in a bot's
// own conversation, mentions in each bot's color, cards, events and each run's
// steps, collapsible.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Bot, Step, TimelineItem } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";
import { useStore, type RunView } from "../store.js";
import { canSpeak, speak } from "../voice.js";
import { Avatar, BotFace } from "./Avatar.js";
import { CardView } from "./Cards.js";
import { SpeakerIcon } from "./Icons.js";
import { Markdown, plainText } from "./Markdown.js";

export { RichText } from "./Markdown.js";

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);
/** A pause this long starts a new time separator. */
const GAP_MS = 20 * 60_000;

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

/** How close to the bottom (px) still counts as "reading the latest". */
const STICK_PX = 120;

/** The element that scrolls the timeline: its nearest scrollable ancestor. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/** One bot at work: its current run, and how many more of its runs wait in line here. */
interface Working {
  bot: Bot | undefined;
  run: RunView;
  queued: number;
  runIds: string[];
}

/** Active runs grouped by bot: one bubble per bot, never one per queued run. */
export function workingBots(activeRuns: RunView[], bots: Record<string, Bot>): Working[] {
  const byBot = new Map<string, RunView[]>();
  for (const run of activeRuns) byBot.set(run.botId, [...(byBot.get(run.botId) ?? []), run]);
  return [...byBot.entries()].map(([botId, runs]) => {
    const current = runs.find((r) => r.status === "running" || r.status === "waiting") ?? runs[0]!;
    return { bot: bots[botId], run: current, queued: runs.length - 1, runIds: runs.map((r) => r.id) };
  });
}

export function Timeline({
  items,
  bots,
  runs,
  activeRuns,
  ownBotId = null,
  hasEarlier = false,
  onLoadEarlier,
}: {
  items: TimelineItem[];
  bots: Record<string, Bot>;
  runs: Record<string, RunView>;
  activeRuns: RunView[];
  /** The bot whose own conversation this is; null for a group. */
  ownBotId?: string | null;
  /** Older items exist on the hub. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => Promise<void>;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const root = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(0);
  /** The newest item already counted, so only new items count as "new below" (not a bot starting to type). */
  const counted = useRef<string | undefined>(undefined);
  /** Why trying a failed run again did not work, by run. */
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const byId = new Map(items.map((i) => [i.id, i]));
  // Stable while the bots do not change, so memoized messages are not parsed again on every step.
  const team = useMemo(() => Object.values(bots), [bots]);
  const working = workingBots(activeRuns, bots);
  const conversationId = items[0]?.conversationId ?? activeRuns[0]?.conversationId;
  const lastItem = items.at(-1);
  const stepCount = activeRuns.reduce((n, r) => n + r.steps.length, 0);

  // Follow what arrives only while the user reads the latest: scrolling up to
  // read history is not interrupted; a "new messages" button brings them back.
  useEffect(() => {
    const scroller = scrollParent(root.current);
    if (!scroller) return;
    const onScroll = () => {
      stick.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_PX;
      if (stick.current) setUnseen(0);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  // Opening another conversation starts at its latest message.
  useLayoutEffect(() => {
    stick.current = true;
    setUnseen(0);
    counted.current = undefined;
    end.current?.scrollIntoView?.({ block: "end" });
  }, [conversationId]);
  useEffect(() => {
    const previous = counted.current;
    counted.current = lastItem?.id;
    // The user's own message brings them back to the latest.
    if (lastItem?.author.type === "user") stick.current = true;
    if (stick.current) {
      end.current?.scrollIntoView?.({ block: "end" });
      return;
    }
    if (previous !== undefined && lastItem && lastItem.id !== previous) setUnseen((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastItem?.id, working.length]);
  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView?.({ block: "end" });
  }, [stepCount]);

  const loadEarlier = async () => {
    if (!onLoadEarlier || loadingEarlier) return;
    const scroller = scrollParent(root.current);
    const fromBottom = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
    setLoadingEarlier(true);
    try {
      await onLoadEarlier();
    } finally {
      setLoadingEarlier(false);
      // Keep the message the user was looking at in place.
      requestAnimationFrame(() => {
        if (scroller) scroller.scrollTop = scroller.scrollHeight - fromBottom;
      });
    }
  };

  const fromOther = (item: TimelineItem | undefined) =>
    item !== undefined && item.author.type === "bot" && ownBotId !== null && item.author.id !== ownBotId && item.kind !== "event";

  return (
    <div className="timeline" role="log" aria-live="polite" ref={root}>
      {hasEarlier && onLoadEarlier && (
        <div className="load-earlier">
          <button type="button" className="link" onClick={() => void loadEarlier()} disabled={loadingEarlier}>
            {loadingEarlier ? t("timeline.loading") : t("timeline.loadEarlier")}
          </button>
        </div>
      )}
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
          const failed = item.event?.type === "run.failed" ? (item.event.data as { runId?: string }).runId : undefined;
          const retried = failed ? Object.values(runs).some((r) => r.retryOf === failed) : false;
          // A routine's run is tried again from the routine, which keeps its rules (draft-only tests).
          const trigger = failed ? runs[failed]?.trigger.type : undefined;
          const retryable = failed && !retried && trigger !== "routine" && trigger !== "webhook";
          const retry = async (runId: string) => {
            try {
              await useStore.getState().retryRun(runId);
            } catch (err) {
              setRetryErrors((e) => ({ ...e, [runId]: err instanceof Error ? err.message : String(err) }));
            }
          };
          parts.push(
            <div key="item" className={`event event-${item.event?.type ?? "info"}`} data-testid="event">
              {item.text}
              {retryable && (
                <>
                  {" "}
                  <button type="button" className="link event-action" onClick={() => void retry(failed)}>
                    {t("run.retry")}
                  </button>
                </>
              )}
              {failed && retryErrors[failed] && <span className="error"> {retryErrors[failed]}</span>}
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
                    <Markdown text={item.text} bots={team} />
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
                    onClick={() => speak(plainText(item.text), lang)}
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
      {working.map(({ bot, run, queued, runIds }) => {
        const name = bot?.name ?? "bot";
        const waiting = run.status === "waiting";
        return (
          <div key={run.botId} className={`message message-bot working${waiting ? " waiting" : ""}`} data-testid="working">
            <span className="message-face">{bot && <Avatar bot={bot} size={28} />}</span>
            <div className="bubble-wrap">
              <div className="working-row">
                {waiting ? (
                  <div className="bubble waiting-note" data-testid="waiting">
                    {t("steps.waiting", { name })}
                  </div>
                ) : (
                  <div className="bubble typing" aria-label={t("steps.running", { name })}>
                    <span className="sr-only">{t("steps.running", { name })}</span>
                    <span className="dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="stop-run"
                  data-testid="stop-run"
                  aria-label={t("run.stop", { name })}
                  title={t("run.stop", { name })}
                  onClick={() => void useStore.getState().cancelRuns(runIds)}
                >
                  ■
                </button>
              </div>
              {queued > 0 && <div className="queued-note muted">{t("steps.queued", { count: queued })}</div>}
              <Steps run={run} open />
            </div>
          </div>
        );
      })}
      {unseen > 0 && (
        <button
          type="button"
          className="new-below"
          data-testid="new-below"
          onClick={() => {
            stick.current = true;
            setUnseen(0);
            end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
          }}
        >
          ↓ {t("timeline.newBelow", { count: unseen })}
        </button>
      )}
      <div ref={end} />
    </div>
  );
}
