// One timeline (specs/web-app): the user's messages on the right, the bots' on
// the left, time separators, "Messages from …" when colleagues speak in a bot's
// own conversation, mentions in each bot's color, cards, events and each run's
// steps, collapsible.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AvatarShape, Bot, Step, TimelineItem } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";
import { useStore, type RunView } from "../store.js";
import { canSpeak, speak } from "../voice.js";
import { Avatar, BotFace } from "./Avatar.js";
import { CardView } from "./Cards.js";
import { FileAttachments } from "./Files.js";
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

/** The backstage items of each chain (one request of the user and everything it set off), in order. */
export function backstageByChain(items: TimelineItem[], runs: Record<string, RunView>): Map<string, TimelineItem[]> {
  const chains = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (!item.backstage) continue;
    const chain = item.runId ? runs[item.runId]?.chainId : undefined;
    if (!chain) continue;
    chains.set(chain, [...(chains.get(chain) ?? []), item]);
  }
  return chains;
}

/**
 * The runs of tasks handed out backstage, by the bot that handed them out: "Beatriz is talking with Marina and
 * Helena…" instead of a bubble per bot (change 0082).
 */
export function teamAtWork(activeRuns: RunView[], byId: Map<string, TimelineItem>): { runIds: Set<string>; leads: Array<{ leadId: string; botIds: string[] }> } {
  const runIds = new Set<string>();
  const byLead = new Map<string, string[]>();
  for (const run of activeRuns) {
    if (run.trigger.type !== "handoff" || !run.trigger.ref) continue;
    const card = byId.get(run.trigger.ref);
    if (!card?.backstage || card.card?.type !== "handoff") continue;
    const lead = (card.card.data as { from?: string }).from;
    if (!lead) continue;
    runIds.add(run.id);
    const list = byLead.get(lead) ?? [];
    if (!list.includes(run.botId)) list.push(run.botId);
    byLead.set(lead, list);
  }
  return { runIds, leads: [...byLead.entries()].map(([leadId, botIds]) => ({ leadId, botIds })) };
}

/** A chain's backstage, opened: who handed what to whom, and what each answered. */
function BackstageDialog({ items, bots, onClose }: { items: TimelineItem[]; bots: Record<string, Bot>; onClose(): void }) {
  const t = useT();
  const team = useMemo(() => Object.values(bots), [bots]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog backstage-dialog" role="dialog" aria-label={t("backstage.title")} data-testid="backstage">
        <header className="backstage-head">
          <h2>🧠 {t("backstage.title")}</h2>
          <button type="button" className="icon-btn" aria-label={t("computer.close")} onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="muted small">{t("backstage.help")}</p>
        <ol className="backstage-list">
          {items.map((item) => {
            const bot = item.author.type === "bot" ? bots[item.author.id ?? ""] : undefined;
            return (
              <li key={item.id} className={`backstage-item kind-${item.kind}`}>
                {item.kind === "card" ? (
                  <CardView item={item} bot={bot} bots={bots} />
                ) : (
                  <div className="backstage-message">
                    <div className="backstage-who">
                      {bot && <Avatar bot={bot} size={22} />}
                      <strong style={bot ? { color: bot.avatar.color } : undefined}>{bot?.name ?? t("backstage.system")}</strong>
                    </div>
                    <Markdown text={item.text} bots={team} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The joins and leaves of a group, and a new lead, shown with the bot's face. */
const MEMBER_EVENTS = new Set(["member.joined", "member.left", "member.absent", "group.lead"]);
/** A group's name, description or photo changing, said as a chat app says it. */
const GROUP_EVENTS = new Set(["group.renamed", "group.described", "group.photo"]);
const STYLE_EVENTS = new Set(["conversation.style", "conversation.backstage"]);
/** How long a message found by a search stays marked. */
const FLASH_MS = 2500;

export function Timeline({
  items: allItems,
  bots,
  runs,
  activeRuns,
  ownBotId = null,
  hasEarlier = false,
  onLoadEarlier,
  focus = null,
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
  /** A message to scroll to and mark (a search result); `at` makes the same message shown twice scroll twice. */
  focus?: { itemId: string; at: number } | null;
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
  const [flash, setFlash] = useState<string | null>(null);
  // Show a message asked for (a search result): scroll to it, stop following the latest, mark it a moment.
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`item-${focus.itemId}`);
    if (!el) return;
    stick.current = false;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    setFlash(focus.itemId);
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [focus?.itemId, focus?.at, allItems.length]);
  // The team's work stays backstage (change 0082): out of the chat, a tap away from the answer it led to.
  const items = useMemo(() => allItems.filter((i) => !i.backstage), [allItems]);
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const backstage = useMemo(() => backstageByChain(allItems, runs), [allItems, runs]);
  const [openBackstage, setOpenBackstage] = useState<TimelineItem[] | null>(null);
  /** The last message the chat shows of each chain that has backstage work: where "See backstage" goes. */
  const backstageAnchor = useMemo(() => {
    const anchors = new Map<string, string>();
    for (const item of items) {
      const chain = item.runId ? runs[item.runId]?.chainId : undefined;
      if (chain && backstage.has(chain) && item.kind === "message" && item.author.type === "bot") anchors.set(chain, item.id);
    }
    return anchors;
  }, [items, runs, backstage]);
  // Stable while the bots do not change, so memoized messages are not parsed again on every step.
  const team = useMemo(() => Object.values(bots), [bots]);
  // Bots working on a task handed to them backstage show as one line under the bot that handed it out.
  const teamWork = teamAtWork(activeRuns, byId);
  const working = workingBots(
    activeRuns.filter((r) => !teamWork.runIds.has(r.id)),
    bots,
  );
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

        if (item.kind === "event" && item.event && MEMBER_EVENTS.has(item.event.type)) {
          // "<bot> joined/left the group", with its face, as a chat app shows it.
          const data = item.event.data as { botId?: string; name?: string; color?: string; shape?: AvatarShape; reason?: string };
          const face = bots[data.botId ?? ""] ?? {
            name: data.name ?? "?",
            state: "idle" as const,
            avatar: { initials: "", color: data.color ?? "#888", shape: data.shape ?? "orb" },
          };
          const name = bots[data.botId ?? ""]?.name ?? data.name ?? "?";
          const text =
            item.event.type === "member.joined"
              ? t("group.joined", { name })
              : item.event.type === "group.lead"
                ? t("group.leadEvent", { name })
                : item.event.type === "member.absent"
                  ? t("group.absent", { name })
                  : data.reason === "deleted"
                    ? t("group.leftDeleted", { name })
                    : t("group.left", { name });
          parts.push(
            <div key="item" className={`event event-member event-${item.event.type}`} data-testid="event">
              <Avatar bot={face} size={20} />
              <span>{text}</span>
            </div>,
          );
        } else if (item.kind === "event" && item.event && STYLE_EVENTS.has(item.event.type)) {
          const data = item.event.data as { replyStyle?: string; backstage?: boolean };
          const text =
            item.event.type === "conversation.style"
              ? t(data.replyStyle === "chat" ? "style.event.chat" : "style.event.detailed")
              : t(data.backstage ? "style.event.backstageOn" : "style.event.backstageOff");
          parts.push(
            <div key="item" className={`event event-style`} data-testid="event">
              <span>{text}</span>
            </div>,
          );
        } else if (item.kind === "event" && item.event && GROUP_EVENTS.has(item.event.type)) {
          const data = item.event.data as { title?: string; removed?: boolean };
          const text =
            item.event.type === "group.renamed"
              ? t("group.renamedEvent", { title: data.title ?? "" })
              : item.event.type === "group.described"
                ? data.removed
                  ? t("group.descriptionRemovedEvent")
                  : t("group.describedEvent")
                : data.removed
                  ? t("group.photoRemovedEvent")
                  : t("group.photoEvent");
          parts.push(
            <div key="item" className={`event event-${item.event.type}`} data-testid="event">
              <span>{text}</span>
            </div>,
          );
        } else if (item.kind === "event") {
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
              id={`item-${item.id}`}
              className={`message ${mine ? "message-user" : "message-bot"}${bot && bot.id === ownBotId ? " own" : ""}${sameAuthor ? " continued" : ""}${flash === item.id ? " flash" : ""}`}
              data-testid="message"
            >
              {!mine && <span className="message-face">{showWho && bot ? <Avatar bot={bot} size={28} /> : null}</span>}
              <div className="bubble-wrap">
                {showWho && bot && (
                  <div className="bubble-author" style={{ color: bot.avatar.color }}>
                    {bot.name}
                  </div>
                )}
                {run?.trigger.type === "initiative" && (
                  <div className="initiative-tag" data-testid="initiative-tag">
                    {t(run.trigger.ref === "mcp" ? "initiative.tagMcp" : "initiative.tag")}
                  </div>
                )}
                <div className="bubble" title={new Date(item.createdAt).toLocaleString(lang)}>
                  {parent && (
                    <div className="reply-to" data-testid="reply-to">
                      ↪ {t("thread.replyTo", { text: clip(parent.text, 80) })}
                    </div>
                  )}
                  {(item.files?.length ?? 0) + (item.attachments?.length ?? 0) > 0 && (
                    <FileAttachments files={item.files ?? []} deleted={Math.max(0, (item.attachments?.length ?? 0) - (item.files?.length ?? 0))} />
                  )}
                  {item.text && (
                    <div className="bubble-text">
                      <Markdown text={item.text} bots={team} />
                    </div>
                  )}
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
                {run && backstageAnchor.get(run.chainId) === item.id && (
                  <button type="button" className="backstage-link" data-testid="backstage-link" onClick={() => setOpenBackstage(backstage.get(run.chainId) ?? [])}>
                    🧠 {t("backstage.open", { count: new Set((backstage.get(run.chainId) ?? []).map((i) => i.author.id).filter(Boolean)).size })}
                  </button>
                )}
              </div>
            </div>,
          );
        }
        return <Fragment key={item.id}>{parts}</Fragment>;
      })}
      {teamWork.leads.map(({ leadId, botIds }) => {
        const lead = bots[leadId];
        const others = botIds.map((id) => bots[id]?.name ?? "bot");
        const text = t("backstage.working", { name: lead?.name ?? "bot", others: listOf(others, t("backstage.and")) });
        return (
          <div key={`team-${leadId}`} className="message message-bot working team-working" data-testid="team-working">
            <span className="message-face">{lead && <Avatar bot={lead} size={28} />}</span>
            <div className="bubble-wrap">
              <div className="working-row">
                <div className="bubble typing team-note" aria-label={text}>
                  <span>{text}</span>
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
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
      {openBackstage && <BackstageDialog items={openBackstage} bots={bots} onClose={() => setOpenBackstage(null)} />}
    </div>
  );
}

/** "Marina", "Marina and Helena", "Marina, Helena and Lucas". */
function listOf(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}
