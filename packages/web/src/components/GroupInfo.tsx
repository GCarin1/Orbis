// A group as a chat app shows it (specs/web-app, change 0042-group-info-like-a-chat-app): the header with
// its photo, name and members; the ⋮ menu with every group option; the group's info — a flyout on the right
// (full screen on a phone) with its photo, name, description, members, links and search; and the dialog
// that adds members.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Bot, Conversation, ConversationLink, TimelineItem } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { Avatar, StateLabel } from "./Avatar.js";
import { GroupFace } from "./Sidebar.js";
import {
  BackIcon,
  BellIcon,
  BellOffIcon,
  CameraIcon,
  ChatIcon,
  ChevronRightIcon,
  CloseIcon,
  EraseIcon,
  ExportIcon,
  InfoIcon,
  LinkIcon,
  MoreIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  UserPlusIcon,
} from "./Icons.js";

export type GroupView = "info" | "search" | "links";

/** What the menu, the header and the info do to the group; App wires them to the store. */
export interface GroupActions {
  info(view?: GroupView): void;
  add(): void;
  mute(muted: boolean): Promise<void>;
  exportChat(): Promise<void>;
  clear(): Promise<void>;
  remove(): Promise<void>;
}

const members = (group: Conversation, bots: Record<string, Bot>) => group.members.map((id) => bots[id]).filter((b): b is Bot => b !== undefined);
const working = (bot: Bot) => bot.state === "thinking" || bot.state === "working";

/** A picked image as the group's photo: cut to a centred square of at most 320 px, as a JPEG `data:` URL. */
export async function photoFromFile(file: File, max = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("not an image"));
      image.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(max, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The conversation as text, one line per message or event, as a chat app exports it. */
export function conversationText(group: Conversation, items: TimelineItem[], bots: Record<string, Bot>, lang: string, you: string): string {
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" });
  const lines = items
    .filter((item) => item.text.trim())
    .map((item) => {
      const who = item.author.type === "user" ? you : item.author.type === "bot" ? (bots[item.author.id ?? ""]?.name ?? "bot") : "Orbis";
      return item.kind === "message" ? `[${when(item.createdAt)}] ${who}: ${item.text}` : `[${when(item.createdAt)}] — ${item.text}`;
    });
  return `${[group.title, ...lines].join("\n")}\n`;
}

/** Close a popup on a click outside it or on Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

/** The group's ⋮ menu: every option, the rarer ones under "More". */
export function GroupMenu({ group, actions }: { group: Conversation; actions: GroupActions }) {
  const t = useT();
  const [open, setOpen] = useState<false | "main" | "more">(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open !== false, ref, () => setOpen(false));
  const item = (label: string, icon: ReactNode, run: () => void, extra?: { danger?: boolean; more?: boolean }) => (
    <button
      type="button"
      role="menuitem"
      className={extra?.danger ? "danger" : undefined}
      onClick={() => {
        if (extra?.more) return setOpen("more");
        setOpen(false);
        run();
      }}
    >
      {icon}
      <span>{label}</span>
      {extra?.more && <ChevronRightIcon size={16} />}
    </button>
  );
  return (
    <div className="new-menu group-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("group.menu")}
        title={t("group.menu")}
        aria-haspopup="menu"
        aria-expanded={open !== false}
        onClick={() => setOpen(open ? false : "main")}
      >
        <MoreIcon />
      </button>
      {open === "main" && (
        <div className="menu" role="menu" aria-label={t("group.menu")}>
          {item(t("group.addMembers"), <UserPlusIcon size={16} />, actions.add)}
          {item(t("group.info"), <InfoIcon size={16} />, () => actions.info("info"))}
          {item(t("group.links"), <LinkIcon size={16} />, () => actions.info("links"))}
          {item(t("group.search"), <SearchIcon size={16} />, () => actions.info("search"))}
          {item(
            group.muted ? t("group.unmute") : t("group.mute"),
            group.muted ? <BellIcon size={16} /> : <BellOffIcon size={16} />,
            () => void actions.mute(!group.muted),
          )}
          {item(t("group.more"), <MoreIcon size={16} />, () => undefined, { more: true })}
        </div>
      )}
      {open === "more" && (
        <div className="menu" role="menu" aria-label={t("group.more")}>
          {item(t("group.back"), <BackIcon size={16} />, () => setOpen("main"), { more: false })}
          {item(t("group.export"), <ExportIcon size={16} />, () => void actions.exportChat())}
          {item(t("conv.clear"), <EraseIcon size={16} />, () => void actions.clear())}
          {item(t("group.delete"), <TrashIcon size={16} />, () => void actions.remove(), { danger: true })}
        </div>
      )}
    </div>
  );
}

/** The group's header: its photo, name and members (or who is working), search and the ⋮ menu. */
export function GroupHeader({ group, bots, onBack, actions }: { group: Conversation; bots: Record<string, Bot>; onBack(): void; actions: GroupActions }) {
  const t = useT();
  const all = members(group, bots);
  const busy = all.filter(working);
  return (
    <header className="conv-head group-head">
      <button className="icon-btn back" aria-label={t("nav.back")} onClick={onBack}>
        <BackIcon />
      </button>
      <button
        type="button"
        className="group-face-btn"
        aria-label={t("group.info")}
        title={t("group.info")}
        onClick={() => actions.info("info")}
        data-testid="group-face"
      >
        <GroupFace group={group} bots={bots} size={38} />
      </button>
      <div className="conv-title group-title" onClick={() => actions.info("info")}>
        <h1>
          {group.title}
          {group.muted && (
            <span className="muted-mark" title={t("group.muted")} aria-label={t("group.muted")}>
              <BellOffIcon size={14} />
            </span>
          )}
        </h1>
        <div className="conv-meta group-subtitle">
          {busy.length ? (
            <span className="typing">{t("group.working", { names: busy.map((b) => b.name).join(", ") })}</span>
          ) : (
            <span>{all.map((b) => b.name).join(", ")}</span>
          )}
        </div>
      </div>
      <div className="conv-actions">
        <button type="button" className="icon-btn" aria-label={t("group.search")} title={t("group.search")} onClick={() => actions.info("search")}>
          <SearchIcon />
        </button>
        <GroupMenu group={group} actions={actions} />
      </div>
    </header>
  );
}

/** Pick bots for the group: those not in it, up to the group's limit; says why when there is none to add. */
export function AddMembersDialog({
  group,
  bots,
  maxGroupSize,
  onAdd,
  onNewBot,
  onCancel,
}: {
  group: Conversation;
  bots: Bot[];
  maxGroupSize: number;
  onAdd(botIds: string[]): Promise<void>;
  onNewBot(): void;
  onCancel(): void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outsiders = bots.filter((b) => !b.hidden && !group.members.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name));
  const room = Math.max(0, maxGroupSize - group.members.length);
  const q = query.trim().toLowerCase();
  const shown = q ? outsiders.filter((b) => `${b.name} ${b.handle} ${b.role}`.toLowerCase().includes(q)) : outsiders;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= room ? p : [...p, id]));
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog add-members"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-members-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!picked.length) return;
          setBusy(true);
          setError(null);
          try {
            await onAdd(picked);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="add-members-title">{t("group.addMembers")}</h2>
        <p className="muted">{t("group.addCount", { count: group.members.length, max: maxGroupSize })}</p>
        {room === 0 ? (
          <p className="notice" role="status">
            {t("group.full", { max: maxGroupSize })}
          </p>
        ) : outsiders.length === 0 ? (
          <p className="notice" role="status">
            {t("group.allIn")}
          </p>
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("group.findBot")}
              aria-label={t("group.findBot")}
              autoFocus
            />
            <div className="member-picker add-list" role="group" aria-label={t("group.addMembers")}>
              {shown.map((bot) => {
                const checked = picked.includes(bot.id);
                return (
                  <label key={bot.id} className="member-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && picked.length >= room}
                      onChange={() => toggle(bot.id)}
                      name={`add-${bot.handle}`}
                    />
                    <Avatar bot={bot} size={30} />
                    <span className="member-text">
                      <strong>{bot.name}</strong>
                      <span className="muted">{bot.role || `@${bot.handle}`}</span>
                    </span>
                  </label>
                );
              })}
              {shown.length === 0 && <p className="muted">{t("group.noMatch")}</p>}
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onNewBot}>
            + {t("roster.new")}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onCancel}>
            {t("group.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || picked.length === 0}>
            {picked.length > 1 ? t("group.addN", { count: picked.length }) : t("group.addOne")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** One member's row in the group's info: a click shows what can be done with it. */
function MemberRow({
  bot,
  lead,
  canRemove,
  onChat,
  onLead,
  onRemove,
}: {
  bot: Bot;
  lead: boolean;
  canRemove: boolean;
  onChat(): void;
  onLead(): void;
  onRemove(): void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li className={`member-row${open ? " open" : ""}`} data-testid={`member-${bot.handle}`}>
      <button type="button" className="member-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar bot={bot} size={40} />
        <span className="member-text">
          <strong>{bot.name}</strong>
          <span className="muted">{bot.role || `@${bot.handle}`}</span>
        </span>
        <span className="member-side">
          {lead && <span className="badge lead-badge">{t("group.leadBadge")}</span>}
          <StateLabel state={bot.state} />
        </span>
      </button>
      {open && (
        <div className="member-actions">
          <button type="button" className="btn" onClick={onChat}>
            <ChatIcon size={15} /> {t("group.chatWith", { name: bot.name })}
          </button>
          {!lead && (
            <button type="button" className="btn" onClick={onLead}>
              {t("group.makeLead")}
            </button>
          )}
          {canRemove && (
            <button type="button" className="btn danger" onClick={onRemove}>
              {t("group.remove", { name: bot.name })}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** The group's info, its links and its search: a flyout on the right, full screen on a phone. */
export function GroupInfoPanel({
  api,
  group,
  bots,
  view,
  onView,
  onClose,
  actions,
  onUpdate,
  onRemoveMember,
  onOpenBot,
  onShowItem,
  readPhoto = photoFromFile,
}: {
  api: Api;
  group: Conversation;
  bots: Record<string, Bot>;
  view: GroupView;
  onView(view: GroupView): void;
  onClose(): void;
  actions: GroupActions;
  onUpdate(patch: { title?: string; description?: string; photo?: string | null; leadBotId?: string }): Promise<void>;
  onRemoveMember(botId: string): Promise<void>;
  onOpenBot(botId: string): void;
  onShowItem(itemId: string): Promise<void>;
  readPhoto?: (file: File) => Promise<string>;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<null | "title" | "description">(null);
  const [draft, setDraft] = useState("");
  const [links, setLinks] = useState<ConversationLink[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TimelineItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const list = members(group, bots);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // The links, for the "media, links and docs" count and list; again when the conversation moves on.
  useEffect(() => {
    let live = true;
    api
      .get<ConversationLink[]>(`/api/v1/conversations/${group.id}/links`)
      .then((found) => live && setLinks(found))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [api, group.id, group.lastItemAt]);

  // Search as the user types, a moment after the last key.
  useEffect(() => {
    const q = query.trim();
    if (view !== "search" || !q) {
      setResults(null);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<TimelineItem[]>(`/api/v1/conversations/${group.id}/search?q=${encodeURIComponent(q)}`)
        .then((found) => live && setResults(found))
        .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, group.id, query, view]);

  const save = (field: "title" | "description") =>
    run(async () => {
      const value = draft.trim();
      if (field === "title" && !value) throw new Error(t("group.nameRequired"));
      await onUpdate({ [field]: value });
      setEditing(null);
    });

  const who = (item: { author: { type: string; id: string | null } }) =>
    item.author.type === "user" ? t("group.you") : item.author.type === "bot" ? (bots[item.author.id ?? ""]?.name ?? "bot") : "Orbis";

  const head = (title: string, back?: boolean) => (
    <header className="panel-head">
      {back ? (
        <button type="button" className="icon-btn" aria-label={t("group.back")} onClick={() => onView("info")}>
          <BackIcon />
        </button>
      ) : (
        <button type="button" className="icon-btn" aria-label={t("computer.close")} onClick={onClose}>
          <CloseIcon />
        </button>
      )}
      <span className="panel-title">{title}</span>
      <span className="spacer" />
    </header>
  );

  if (view === "search") {
    const q = query.trim();
    return (
      <aside className="side-panel group-info" aria-label={t("group.search")} data-testid="group-info">
        {head(t("group.searchTitle"), true)}
        <input
          type="search"
          className="group-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("group.searchPlaceholder")}
          aria-label={t("group.searchPlaceholder")}
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        {!q ? (
          <p className="muted">{t("group.searchHint", { title: group.title })}</p>
        ) : searching && !results ? (
          <p className="muted">{t("timeline.loading")}</p>
        ) : results && results.length === 0 ? (
          <p className="muted">{t("group.noResults", { query: q })}</p>
        ) : (
          <ul className="search-results">
            {(results ?? []).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void run(() => onShowItem(item.id))}>
                  <span className="result-head">
                    <strong>{who(item)}</strong>
                    <time>{date(item.createdAt)}</time>
                  </span>
                  <Highlight text={item.text} query={q} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    );
  }

  if (view === "links") {
    return (
      <aside className="side-panel group-info" aria-label={t("group.links")} data-testid="group-info">
        {head(t("group.links"), true)}
        {links === null ? (
          <p className="muted">{t("timeline.loading")}</p>
        ) : links.length === 0 ? (
          <p className="muted">{t("group.noLinks")}</p>
        ) : (
          <ul className="link-list">
            {links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noreferrer noopener">
                  <LinkIcon size={16} />
                  <span className="link-text">
                    <strong>{hostOf(link.url)}</strong>
                    <span className="muted">{link.url}</span>
                  </span>
                </a>
                <button type="button" className="link" onClick={() => void run(() => onShowItem(link.itemId))}>
                  {who(link)} · {date(link.createdAt)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    );
  }

  return (
    <aside className="side-panel group-info" aria-label={t("group.info")} data-testid="group-info">
      {head(t("group.info"))}
      <section className="group-hero">
        <div className="group-photo-edit">
          <button
            type="button"
            className="group-photo-big"
            aria-label={t("group.changePhoto")}
            title={t("group.changePhoto")}
            onClick={() => photoInput.current?.click()}
          >
            <GroupFace group={group} bots={bots} size={132} />
            <span className="photo-overlay" aria-hidden="true">
              <CameraIcon size={22} />
            </span>
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            aria-label={t("group.changePhoto")}
            name="group-photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void run(async () => onUpdate({ photo: await readPhoto(file) }));
            }}
          />
          {group.photo && (
            <button type="button" className="link" onClick={() => void run(() => onUpdate({ photo: null }))}>
              {t("group.removePhoto")}
            </button>
          )}
        </div>
        {editing === "title" ? (
          <form
            className="inline-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void save("title");
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} aria-label={t("newgroup.name")} autoFocus />
            <button type="submit" className="btn btn-primary">
              {t("group.save")}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              {t("group.cancel")}
            </button>
          </form>
        ) : (
          <h2 className="group-name">
            {group.title}
            <button
              type="button"
              className="icon-btn"
              aria-label={t("group.rename")}
              title={t("group.rename")}
              onClick={() => {
                setDraft(group.title);
                setEditing("title");
              }}
            >
              <PencilIcon size={16} />
            </button>
          </h2>
        )}
        <p className="muted">
          {t("group.kind")} · <span className="accent">{t("group.memberCount", { count: list.length })}</span>
        </p>
        {editing === "description" ? (
          <form
            className="inline-edit description-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void save("description");
            }}
          >
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={4} aria-label={t("group.description")} autoFocus />
            <p className="muted settings-help">{t("group.descriptionHelp")}</p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                {t("group.cancel")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("group.save")}
              </button>
            </div>
          </form>
        ) : group.description ? (
          <div className="group-description">
            <p>{group.description}</p>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("group.editDescription")}
              title={t("group.editDescription")}
              onClick={() => {
                setDraft(group.description);
                setEditing("description");
              }}
            >
              <PencilIcon size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="link accent"
            onClick={() => {
              setDraft("");
              setEditing("description");
            }}
          >
            {t("group.addDescription")}
          </button>
        )}
        <div className="round-actions">
          <RoundAction label={t("group.addShort")} icon={<UserPlusIcon />} onClick={actions.add} />
          <RoundAction label={t("group.searchShort")} icon={<SearchIcon />} onClick={() => onView("search")} />
          <RoundAction
            label={group.muted ? t("group.unmuteShort") : t("group.muteShort")}
            icon={group.muted ? <BellIcon /> : <BellOffIcon />}
            pressed={group.muted}
            onClick={() => void run(() => actions.mute(!group.muted))}
          />
          <RoundAction label={t("group.exportShort")} icon={<ExportIcon />} onClick={() => void run(actions.exportChat)} />
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="info-card">
        <button type="button" className="info-row" onClick={() => onView("links")}>
          <span>{t("group.links")}</span>
          <span className="muted">{links?.length ?? "…"}</span>
          <ChevronRightIcon size={16} />
        </button>
        {links && links.length > 0 && (
          <div className="link-chips">
            {links.slice(0, 3).map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className="chip">
                <LinkIcon size={14} /> {hostOf(link.url)}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="info-card">
        <h3 className="info-title">{t("group.memberCount", { count: list.length })}</h3>
        <ul className="member-list">
          <li>
            <button type="button" className="member-main add-row" onClick={actions.add}>
              <span className="round-icon accent-bg">
                <UserPlusIcon size={18} />
              </span>
              <strong>{t("group.addMembers")}</strong>
            </button>
          </li>
          {list.map((bot) => (
            <MemberRow
              key={bot.id}
              bot={bot}
              lead={bot.id === group.leadBotId}
              canRemove={list.length > 1}
              onChat={() => onOpenBot(bot.id)}
              onLead={() => void run(() => onUpdate({ leadBotId: bot.id }))}
              onRemove={() => {
                if (window.confirm(t("group.confirmRemove", { name: bot.name }))) void run(() => onRemoveMember(bot.id));
              }}
            />
          ))}
        </ul>
        <p className="muted settings-help">{t("group.leadHelp")}</p>
      </section>

      <section className="info-card">
        <button type="button" className="info-row" onClick={() => void run(() => actions.mute(!group.muted))} aria-pressed={group.muted}>
          {group.muted ? <BellOffIcon /> : <BellIcon />}
          <span>
            {t("group.notifications")}
            <small className="muted">{group.muted ? t("group.notificationsOff") : t("group.notificationsOn")}</small>
          </span>
        </button>
      </section>

      <section className="info-card danger-zone">
        <button type="button" className="info-row danger" onClick={() => void run(actions.clear)}>
          <EraseIcon /> <span>{t("conv.clear")}</span>
        </button>
        <button type="button" className="info-row danger" onClick={() => void run(actions.remove)}>
          <TrashIcon /> <span>{t("group.delete")}</span>
        </button>
      </section>
      <p className="muted created-at">{t("group.created", { date: date(group.createdAt) })}</p>
    </aside>
  );
}

function RoundAction({ label, icon, onClick, pressed }: { label: string; icon: ReactNode; onClick(): void; pressed?: boolean }) {
  return (
    <button type="button" className="round-action" onClick={onClick} aria-pressed={pressed}>
      <span className="round-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** The text of a search result with what was searched marked (ignoring case and accents, as the hub does). */
function Highlight({ text, query }: { text: string; query: string }) {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const plain = text.replace(/\s+/g, " ");
  // Folding keeps one character per character here (accents are dropped after NFD), so positions match.
  const folded = [...plain].map((c) => fold(c)).join("");
  const at = folded.indexOf(fold(query));
  if (at < 0) return <span className="result-text">{plain.slice(0, 160)}</span>;
  const start = Math.max(0, at - 50);
  const chars = [...plain];
  const before = chars.slice(start, at).join("");
  const match = chars.slice(at, at + [...fold(query)].length).join("");
  const after = chars.slice(at + match.length, at + match.length + 100).join("");
  return (
    <span className="result-text">
      {start > 0 ? "…" : ""}
      {before}
      <mark>{match}</mark>
      {after}
    </span>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
