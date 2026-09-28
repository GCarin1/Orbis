// The sidebar (specs/web-app): search, one list of conversations — each bot and
// each group — pinned first and then by latest activity, with the bot's face,
// what it is doing or said last, the time and an unread dot; the screens and
// the user at the bottom.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Approval, Bot, Conversation } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";
import { ApprovalsInbox } from "./ApprovalsInbox.js";
import { Avatar, Mascot, StateLabel } from "./Avatar.js";
import { PlusIcon, SearchIcon, SkillsIcon, SlidersIcon, UsageIcon } from "./Icons.js";
import { LanguageSwitch } from "./LanguageSwitch.js";

export type View = "chat" | "skills" | "usage" | "settings" | "new-bot";

export interface ChatEntry {
  key: string;
  kind: "bot" | "group";
  title: string;
  /** Latest activity (ISO), or null. */
  at: string | null;
  pinned: boolean;
  bot?: Bot;
  group?: Conversation;
  /** The conversation the entry opens, when known. */
  conversationId?: string;
}

/** Every visible bot and every group, pinned first, then by latest activity, then by name. */
export function chatEntries(bots: Bot[], conversations: Conversation[]): ChatEntry[] {
  const directOf = new Map(conversations.filter((c) => c.kind === "direct" && c.members[0]).map((c) => [c.members[0]!, c]));
  const latest = (...times: Array<string | null | undefined>) => times.filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const entries: ChatEntry[] = [
    ...bots
      .filter((b) => !b.hidden)
      .map<ChatEntry>((bot) => {
        const direct = directOf.get(bot.id);
        return {
          key: `bot:${bot.id}`,
          kind: "bot",
          title: bot.name,
          at: latest(bot.lastMessage?.at, direct?.lastItemAt),
          pinned: bot.pinned,
          bot,
          ...(direct ? { conversationId: direct.id } : {}),
        };
      }),
    ...conversations
      .filter((c) => c.kind === "group")
      .map<ChatEntry>((group) => ({ key: `group:${group.id}`, kind: "group", title: group.title, at: group.lastItemAt ?? group.createdAt, pinned: false, group, conversationId: group.id })),
  ];
  return entries.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || (b.at ?? "").localeCompare(a.at ?? "") || a.title.localeCompare(b.title),
  );
}

export function matches(entry: ChatEntry, query: string, bots: Record<string, Bot>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay =
    entry.kind === "bot"
      ? [entry.bot!.name, entry.bot!.handle, entry.bot!.role, entry.bot!.lastMessage?.text ?? ""]
      : [entry.title, ...entry.group!.members.map((id) => bots[id]?.name ?? "")];
  return hay.some((h) => h.toLowerCase().includes(q.replace(/^@/, "")));
}

export function timeOf(iso: string, lang: string, yesterday: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return yesterday;
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(lang, { weekday: "long" });
  return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
}

/** Up to three members' faces, stacked like a small crowd. */
export function GroupFace({ group, bots, size = 40 }: { group: Conversation; bots: Record<string, Bot>; size?: number }) {
  const members = group.members.map((id) => bots[id]).filter((b): b is Bot => b !== undefined).slice(0, 3);
  const small = Math.round(size * 0.62);
  return (
    <span className="group-face" style={{ width: size, height: size }} aria-hidden="true">
      {members.map((bot, i) => (
        <span key={bot.id} className={`group-face-${i}`}>
          <Avatar bot={bot} size={small} />
        </span>
      ))}
    </span>
  );
}

function Row({
  entry,
  selected,
  unread,
  bots,
  onOpen,
}: {
  entry: ChatEntry;
  selected: boolean;
  unread: boolean;
  bots: Record<string, Bot>;
  onOpen(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const bot = entry.bot;
  const busy = bot && bot.state !== "idle" && bot.state !== "done";
  let preview: ReactNode;
  if (bot) preview = busy ? <StateLabel state={bot.state} /> : (bot.lastMessage?.text ?? bot.role);
  else preview = entry.group!.members.map((id) => bots[id]?.name ?? "?").join(", ");
  return (
    <li>
      <button
        className={`chat-row${selected ? " selected" : ""}${unread ? " unread" : ""}`}
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        data-testid={bot ? `bot-${bot.handle}` : `conv-${entry.group!.id}`}
      >
        {bot ? <Avatar bot={bot} size={40} /> : <GroupFace group={entry.group!} bots={bots} />}
        <span className="chat-text">
          <span className="chat-line">
            <strong className="chat-title">{entry.title}</strong>
            {entry.at && <time>{timeOf(entry.at, lang, t("time.yesterday"))}</time>}
          </span>
          <span className="chat-line">
            <span className="chat-preview">{preview}</span>
            {unread && <span className="unread-dot" aria-label={t("sidebar.unread")} />}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Sidebar({
  bots,
  conversations,
  approvals,
  selectedBotId,
  selectedGroupId,
  view,
  isUnread,
  onOpenBot,
  onOpenGroup,
  onNewBot,
  onNewGroup,
  onView,
}: {
  bots: Record<string, Bot>;
  conversations: Conversation[];
  approvals: Approval[];
  selectedBotId: string | null;
  selectedGroupId: string | null;
  view: View;
  isUnread(conversationId: string | undefined): boolean;
  onOpenBot(id: string): void;
  onOpenGroup(id: string): void;
  onNewBot(): void;
  onNewGroup(): void;
  onView(view: View): void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const all = chatEntries(Object.values(bots), conversations);
  const entries = all.filter((e) => matches(e, query, bots));
  const favorites = all.filter((e) => e.kind === "bot").slice(0, 4);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const nav = (target: View, icon: ReactNode, label: string, symbol: string) => (
    <button className={`nav-row${view === target ? " selected" : ""}`} aria-pressed={view === target} aria-label={`${symbol} ${label}`} onClick={() => onView(target)}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <label className="search">
          <SearchIcon size={16} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sidebar.search")} aria-label={t("sidebar.search")} />
        </label>
        <div className="new-menu" ref={menuRef}>
          <button className="icon-btn" aria-label={t("sidebar.new")} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title={t("sidebar.new")}>
            <PlusIcon />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onNewBot();
                }}
              >
                + {t("roster.new")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onNewGroup();
                }}
              >
                + {t("groups.new")}
              </button>
            </div>
          )}
        </div>
      </div>

      {favorites.length > 0 && (
        <div className="favorites" aria-hidden="true">
          {favorites.map((e) => (
            <button key={e.key} tabIndex={-1} onClick={() => onOpenBot(e.bot!.id)}>
              <Avatar bot={e.bot!} size={64} />
              <span>{e.title}</span>
            </button>
          ))}
        </div>
      )}

      {approvals.some((a) => a.status === "pending") && <ApprovalsInbox approvals={approvals} bots={bots} onOpen={onOpenBot} />}

      <nav className="chat-list" aria-label={t("sidebar.chats")}>
        {all.length === 0 ? (
          <>
            <button className="chat-row first-bot" onClick={onNewBot}>
              <Mascot size={40} />
              <strong>{t("sidebar.createFirst")}</strong>
            </button>
            <p className="muted chat-empty">{t("sidebar.noChats")}</p>
          </>
        ) : entries.length === 0 ? (
          <p className="muted chat-empty">{t("sidebar.noMatch", { query })}</p>
        ) : (
          <ul>
            {entries.map((entry) => {
              const selected = entry.kind === "bot" ? view === "chat" && entry.bot!.id === selectedBotId : view === "chat" && entry.group!.id === selectedGroupId;
              return (
                <Row
                  key={entry.key}
                  entry={entry}
                  bots={bots}
                  selected={selected}
                  unread={!selected && isUnread(entry.conversationId)}
                  onOpen={() => (entry.kind === "bot" ? onOpenBot(entry.bot!.id) : onOpenGroup(entry.group!.id))}
                />
              );
            })}
          </ul>
        )}
      </nav>

      <div className="sidebar-bottom">
        <nav className="main-nav" aria-label="Orbis">
          {nav("skills", <SkillsIcon />, t("nav.skills"), "📘")}
          {nav("usage", <UsageIcon />, t("nav.usage"), "📊")}
          {nav("settings", <SlidersIcon />, t("nav.settings"), "⚙")}
        </nav>
        <div className="me">
          <Mascot size={28} />
          <span className="me-name">{t("sidebar.you")}</span>
          <LanguageSwitch />
        </div>
      </div>
    </aside>
  );
}
