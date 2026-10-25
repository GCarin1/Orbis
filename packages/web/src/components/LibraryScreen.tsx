// The Library (specs/web-app, change 0079-library): every file of every conversation and the ones put in
// directly, as a grid — images, videos, documents, archived — to open, download, forward to a bot or a group,
// move to a folder, archive or delete, one at a time or several selected; folders, as their own section above
// the files, and who works on them; and how much space it all takes, in one line under the files (change 0096).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Bot, Conversation, LibraryFile, LibraryFolder, LibraryPage, LibraryUsage } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { useStore } from "../store.js";
import { Avatar } from "./Avatar.js";
import { FolderTaskBoard } from "./FolderTaskBoard.js";
import { extensionOf, formatSize, isImage, MAX_FILE_BYTES, saveFile } from "./Files.js";
import { BackIcon, CheckIcon, CloseIcon, DownloadIcon, FileIcon, PlusIcon, SearchIcon, TrashIcon } from "./Icons.js";

type Tab = "all" | "image" | "video" | "doc" | "archived";
type Batch = "delete" | "archive" | "unarchive" | "move" | "forward";

const kindQuery: Record<Tab, string> = { all: "", image: "kind=image", video: "kind=video", doc: "kind=doc", archived: "archived=true" };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A file's square in the grid: the image itself, a video's first frame, or its type. */
function Tile({ api, file, selected, selecting, onOpen, onToggle }: { api: Api; file: LibraryFile; selected: boolean; selecting: boolean; onOpen(): void; onToggle(): void }) {
  const t = useT();
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    hold.current = window.setTimeout(() => {
      held.current = true;
      onToggle();
    }, 500);
  };
  const cancel = () => {
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = null;
  };
  return (
    <button
      type="button"
      className={`library-tile${selected ? " selected" : ""}`}
      aria-pressed={selecting ? selected : undefined}
      aria-label={selecting ? t("library.select", { name: file.name }) : t("files.open", { name: file.name })}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (held.current) return;
        if (selecting) onToggle();
        else onOpen();
      }}
      data-testid="library-tile"
    >
      {isImage(file.mime) ? (
        <img src={api.fileUrl(file.id)} alt="" loading="lazy" />
      ) : file.mime.startsWith("video/") ? (
        <video src={`${api.fileUrl(file.id)}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" />
      ) : (
        <span className="library-tile-doc">
          <FileIcon size={28} />
          <span className="file-ext">{extensionOf(file.name) || "?"}</span>
          <span className="library-tile-name">{file.name}</span>
        </span>
      )}
      {selecting && <span className="library-check">{selected && <CheckIcon size={14} />}</span>}
    </button>
  );
}

/** Pick a bot or a group to send files to. */
function ForwardDialog({ bots, groups, onPick, onCancel }: { bots: Bot[]; groups: Conversation[]; onPick(to: { botId?: string; conversationId?: string }, text: string): void; onCancel(): void }) {
  const t = useT();
  const [text, setText] = useState("");
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog library-pick" role="dialog" aria-label={t("library.forwardTitle")}>
        <h2>{t("library.forwardTitle")}</h2>
        <label>
          {t("library.forwardText")}
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("library.forwardPlaceholder")} />
        </label>
        <ul className="pick-list">
          {bots.map((bot) => (
            <li key={bot.id}>
              <button type="button" className="pick-row" onClick={() => onPick({ botId: bot.id }, text)}>
                <Avatar bot={bot} size={28} />
                <span>{bot.name}</span>
              </button>
            </li>
          ))}
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" className="pick-row" onClick={() => onPick({ conversationId: group.id }, text)}>
                <span className="pick-group">👥</span>
                <span>{group.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("library.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pick the folder to move files to, or none. */
function MoveDialog({ folders, onPick, onCancel }: { folders: LibraryFolder[]; onPick(folderId: string | null): void; onCancel(): void }) {
  const t = useT();
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog library-pick" role="dialog" aria-label={t("library.moveTitle")}>
        <h2>{t("library.moveTitle")}</h2>
        <ul className="pick-list">
          <li>
            <button type="button" className="pick-row" onClick={() => onPick(null)}>
              <span className="pick-group">↩</span>
              <span>{t("library.noFolder")}</span>
            </button>
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <button type="button" className="pick-row" onClick={() => onPick(folder.id)}>
                <span className="pick-group">📁</span>
                <span>{folder.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("library.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A new folder, or an edited one. */
function FolderDialog({ folder, onSave, onCancel }: { folder: LibraryFolder | null; onSave(name: string, description: string): void; onCancel(): void }) {
  const t = useT();
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog"
        role="dialog"
        aria-label={folder ? t("library.editFolder") : t("library.newFolder")}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), description.trim());
        }}
      >
        <h2>{folder ? t("library.editFolder") : t("library.newFolder")}</h2>
        <label>
          {t("library.folderName")}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </label>
        <label>
          {t("library.folderDescription")}
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("library.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            {t("library.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Who works on a folder: bots and groups, checked. */
function AssignDialog({ folder, bots, groups, onSave, onCancel }: { folder: LibraryFolder; bots: Bot[]; groups: Conversation[]; onSave(bots: string[], groups: string[]): void; onCancel(): void }) {
  const t = useT();
  const [pickedBots, setBots] = useState(new Set(folder.bots));
  const [pickedGroups, setGroups] = useState(new Set(folder.groups));
  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog library-pick" role="dialog" aria-label={t("library.assignTitle")}>
        <h2>{t("library.assignTitle")}</h2>
        <p className="muted">{t("library.assignHelp")}</p>
        <ul className="pick-list">
          {bots.map((bot) => (
            <li key={bot.id}>
              <label className="pick-row">
                <input type="checkbox" checked={pickedBots.has(bot.id)} onChange={() => setBots((s) => flip(s, bot.id))} />
                <Avatar bot={bot} size={28} />
                <span>{bot.name}</span>
              </label>
            </li>
          ))}
          {groups.map((group) => (
            <li key={group.id}>
              <label className="pick-row">
                <input type="checkbox" checked={pickedGroups.has(group.id)} onChange={() => setGroups((s) => flip(s, group.id))} />
                <span className="pick-group">👥</span>
                <span>{group.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("library.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave([...pickedBots], [...pickedGroups])}>
            {t("library.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One file opened: shown large or played, where it came from, and what can be done with it. */
function FileSheet({ api, file, bots, onAction, onClose }: { api: Api; file: LibraryFile; bots: Record<string, Bot>; onAction(action: Batch): void; onClose(): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const from = file.author.type === "bot" ? (bots[file.author.id ?? ""]?.name ?? "bot") : t("group.you");
  const where = file.conversationTitle ? t("library.inConversation", { title: file.conversationTitle }) : t("library.onlyHere");
  return (
    <div className="image-viewer library-sheet" role="dialog" aria-label={file.name} data-testid="library-sheet">
      <div className="image-viewer-bar">
        <span className="image-viewer-name">{file.name}</span>
        <button type="button" className="icon-btn" aria-label={t("files.download", { name: file.name })} onClick={() => void saveFile(api, file).catch((e) => setError(errorText(e)))}>
          <DownloadIcon />
        </button>
        <button type="button" className="icon-btn" aria-label={t("computer.close")} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="library-sheet-body">
        {isImage(file.mime) ? (
          <img src={api.fileUrl(file.id)} alt={file.name} />
        ) : file.mime.startsWith("video/") ? (
          <video controls src={api.fileUrl(file.id)} aria-label={file.name} />
        ) : file.mime.startsWith("audio/") ? (
          <audio controls src={api.fileUrl(file.id)} aria-label={file.name} />
        ) : (
          <span className="library-tile-doc big">
            <FileIcon size={48} />
            <span className="file-ext">{extensionOf(file.name)}</span>
          </span>
        )}
      </div>
      <p className="library-sheet-meta">
        {formatSize(file.size, lang)} · {from} · {where} · {new Date(file.createdAt).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })}
      </p>
      {error && <p className="error">{t("files.saveFailed", { error })}</p>}
      <div className="library-sheet-actions">
        <button type="button" className="btn btn-primary" onClick={() => onAction("forward")}>
          {t("library.forward")}
        </button>
        <button type="button" className="btn" onClick={() => onAction("move")}>
          {t("library.move")}
        </button>
        <button type="button" className="btn" onClick={() => onAction(file.archivedAt ? "unarchive" : "archive")}>
          {file.archivedAt ? t("library.unarchive") : t("library.archive")}
        </button>
        <button type="button" className="btn btn-danger" onClick={() => onAction("delete")}>
          {t("library.delete")}
        </button>
      </div>
    </div>
  );
}

/** The disk is this full (%) before the space used shows as a card instead of one quiet line. */
const DISK_WARN = 90;

/**
 * How much the Library takes, of the disk, and its largest files: one quiet line under the files that opens
 * the card, the card open by itself once the disk is nearly full (change 0096).
 */
function UsageCard({ api, usage, onDelete }: { api: Api; usage: LibraryUsage; onDelete(file: LibraryFile): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [open, setOpen] = useState(false);
  const share = usage.disk && usage.disk.size > 0 ? Math.min(100, ((usage.disk.size - usage.disk.free) / usage.disk.size) * 100) : null;
  const full = share !== null && share >= DISK_WARN;
  const [card, setCard] = useState(full);
  if (!card) {
    return (
      <button type="button" className="library-usage-line" onClick={() => setCard(true)} aria-expanded={false} data-testid="library-usage">
        {usage.disk
          ? t("library.usageLine", { size: formatSize(usage.total, lang), free: formatSize(usage.disk.free, lang) })
          : t("library.usedBy", { size: formatSize(usage.total, lang), count: usage.files })}
      </button>
    );
  }
  return (
    <section className={`library-usage${full ? " full" : ""}`} aria-label={t("library.usage")} data-testid="library-usage">
      <div className="library-usage-head">
        <strong>{t("library.usedBy", { size: formatSize(usage.total, lang), count: usage.files })}</strong>
        {usage.disk && <span className="muted">{t("library.diskFree", { free: formatSize(usage.disk.free, lang), size: formatSize(usage.disk.size, lang) })}</span>}
      </div>
      {share !== null && (
        <div className="library-usage-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)} aria-label={t("library.diskUsed")}>
          <span style={{ width: `${share}%` }} />
        </div>
      )}
      <p className="muted small">
        {(["image", "video", "audio", "doc"] as const).map((k) => `${t(`library.kind.${k}`)} ${formatSize(usage.byKind[k], lang)}`).join(" · ")}
      </p>
      {usage.largest.length > 0 && (
        <button type="button" className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t("library.hideLargest") : t("library.showLargest")}
        </button>
      )}
      {open && (
        <ul className="library-largest">
          {usage.largest.map((file) => (
            <li key={file.id}>
              <span className="library-largest-name">{file.name}</span>
              <span className="muted">{formatSize(file.size, lang)}</span>
              <button type="button" className="icon-btn" aria-label={t("files.download", { name: file.name })} onClick={() => void saveFile(api, file)}>
                <DownloadIcon size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label={t("library.deleteName", { name: file.name })} onClick={() => onDelete(file)}>
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LibraryScreen({
  api,
  bots,
  conversations,
  onOpenConversation,
}: {
  api: Api;
  bots: Bot[];
  conversations: Conversation[];
  /** Open the team's conversation of a folder task (change 0080). */
  onOpenConversation?(conversationId: string): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const version = useStore((s) => s.libraryVersion);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [usage, setUsage] = useState<LibraryUsage | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<LibraryFile | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "forward" | "move"; ids: string[] } | { kind: "folder"; folder: LibraryFolder | null } | { kind: "assign"; folder: LibraryFolder }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => Object.fromEntries(bots.map((b) => [b.id, b])), [bots]);
  const groups = useMemo(() => conversations.filter((c) => c.kind === "group"), [conversations]);
  const visibleBots = useMemo(() => bots.filter((b) => !b.hidden), [bots]);
  const folder = folderId ? (folders.find((f) => f.id === folderId) ?? null) : null;

  const listPath = (cursor: string | null) => {
    const params = new URLSearchParams(folderId ? `folder=${encodeURIComponent(folderId)}` : kindQuery[tab]);
    if (query.trim()) params.set("q", query.trim());
    if (cursor) params.set("cursor", cursor);
    return `/api/v1/library?${params.toString()}`;
  };

  // Load the list, the folders and the usage again whenever the Library changes.
  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        const [folderList, used] = await Promise.all([api.get<LibraryFolder[]>("/api/v1/library/folders"), tab === "all" && !folderId ? api.get<LibraryUsage>("/api/v1/library/usage") : Promise.resolve(null)]);
        if (!live) return;
        setFolders(folderList);
        setUsage(used);
        const page = await api.get<LibraryPage>(listPath(null));
        if (!live) return;
        setFiles(page.files);
        setNext(page.next);
      } catch (err) {
        if (live) setError(errorText(err));
      }
    };
    const timer = window.setTimeout(() => void run(), query ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tab, folderId, query, version]);

  const more = async () => {
    if (!next) return;
    const page = await api.get<LibraryPage>(listPath(next));
    setFiles((list) => [...(list ?? []), ...page.files]);
    setNext(page.next);
  };

  const act = async (label: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      if (done) setNotice(done);
      setSelected(new Set());
      setSelecting(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const batch = (action: Batch, ids: string[]) => {
    if (!ids.length) return;
    if (action === "forward" || action === "move") return setDialog({ kind: action, ids });
    if (action === "delete" && !window.confirm(t("library.confirmDelete", { count: ids.length }))) return;
    setOpen(null);
    void act(action, () => api.request("POST", "/api/v1/library/batch", { ids, action }), action === "delete" ? t("library.deleted", { count: ids.length }) : undefined);
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const chosen = [...list];
    const big = chosen.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return setError(t("files.tooLarge", { name: big.name, max: formatSize(MAX_FILE_BYTES, lang) }));
    await act("upload", async () => {
      for (const file of chosen) await api.uploadToLibrary(file, file.name, folderId);
    }, t("library.added", { count: chosen.length }));
    if (input.current) input.current.value = "";
  };

  const toggle = (id: string) => {
    setSelecting(true);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tabs: Array<[Tab, string]> = [
    ["all", t("library.tab.all")],
    ["image", t("library.tab.images")],
    ["video", t("library.tab.videos")],
    ["doc", t("library.tab.docs")],
    ["archived", t("library.tab.archived")],
  ];

  return (
    <section className="screen library" aria-labelledby="library-title" data-testid="library-screen">
      <header className="screen-head">
        <div className="library-title-row">
          {folder && (
            <button type="button" className="icon-btn" aria-label={t("group.back")} onClick={() => setFolderId(null)}>
              <BackIcon />
            </button>
          )}
          <h1 id="library-title">{folder ? `📁 ${folder.name}` : t("library.title")}</h1>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy === "upload"}>
            <PlusIcon size={16} /> {busy === "upload" ? t("library.adding") : t("library.add")}
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} data-testid="library-input" />
        </div>
        {folder ? (
          <div className="library-folder-head">
            {folder.description && <p className="muted">{folder.description}</p>}
            <div className="library-assignees" aria-label={t("library.assignees")}>
              {folder.bots.map((id) => byId[id] && <Avatar key={id} bot={byId[id]!} size={24} />)}
              {folder.groups.map((id) => {
                const group = conversations.find((c) => c.id === id);
                return group ? (
                  <span key={id} className="chip">
                    👥 {group.title}
                  </span>
                ) : null;
              })}
              <button type="button" className="btn btn-sm" onClick={() => setDialog({ kind: "assign", folder })}>
                {folder.bots.length || folder.groups.length ? t("library.changeAssignees") : t("library.assign")}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setDialog({ kind: "folder", folder })}>
                {t("library.editFolder")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  const withFiles = folder.files > 0 && window.confirm(t("library.confirmFolderFiles", { count: folder.files }));
                  if (!window.confirm(t("library.confirmFolder", { name: folder.name }))) return;
                  void act("folder", async () => {
                    await api.request("DELETE", `/api/v1/library/folders/${folder.id}${withFiles ? "?withFiles=true" : ""}`);
                    setFolderId(null);
                  });
                }}
              >
                {t("library.deleteFolder")}
              </button>
            </div>
          </div>
        ) : (
          <div className="library-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`btn btn-sm${tab === id ? " btn-primary" : ""}`}
                onClick={() => {
                  setTab(id);
                  setSelected(new Set());
                  setSelecting(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="library-search">
          <SearchIcon size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("library.search")} aria-label={t("library.search")} />
          <button type="button" className="btn btn-sm" onClick={() => (selecting ? (setSelecting(false), setSelected(new Set())) : setSelecting(true))}>
            {selecting ? t("library.cancel") : t("library.selectMany")}
          </button>
        </div>
      </header>
      <div className="screen-body">
        {error && <p className="error">{error}</p>}
        {notice && (
          <p className="notice" role="status" onClick={() => setNotice(null)}>
            {notice}
          </p>
        )}
        {folder && <FolderTaskBoard api={api} folder={folder} bots={byId} onOpenConversation={onOpenConversation} />}
        {tab === "all" && !folder && !query && (
          <section className="library-folders-section" aria-labelledby="library-folders-title">
            <h2 id="library-folders-title">{t("library.tab.folders")}</h2>
            <div className="library-folders" data-testid="library-folders">
              <button type="button" className="library-folder new" onClick={() => setDialog({ kind: "folder", folder: null })}>
                <PlusIcon /> {t("library.newFolder")}
              </button>
              {folders.map((f) => (
                <button key={f.id} type="button" className="library-folder" onClick={() => setFolderId(f.id)}>
                  <span className="library-folder-icon">📁</span>
                  <strong>{f.name}</strong>
                  <span className="muted small">{t("library.folderCount", { count: f.files, size: formatSize(f.bytes, lang) })}</span>
                  {(f.bots.length > 0 || f.groups.length > 0) && <span className="muted small">{t("library.folderTeam", { count: f.bots.length + f.groups.length })}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
        {files === null ? (
          <p className="muted">{t("timeline.loading")}</p>
        ) : files.length === 0 ? (
          <p className="muted library-empty">{folder ? t("library.emptyFolder") : query ? t("library.noMatch") : t("library.empty")}</p>
        ) : (
          <>
            <div className="library-grid" data-testid="library-grid">
              {files.map((file) => (
                <Tile key={file.id} api={api} file={file} selected={selected.has(file.id)} selecting={selecting} onOpen={() => setOpen(file)} onToggle={() => toggle(file.id)} />
              ))}
            </div>
            {next && (
              <button type="button" className="btn library-more" onClick={() => void more()}>
                {t("library.more")}
              </button>
            )}
          </>
        )}
        {tab === "all" && !folder && usage && <UsageCard api={api} usage={usage} onDelete={(file) => batch("delete", [file.id])} />}
      </div>
      {selecting && selected.size > 0 && (
        <div className="library-batch" role="toolbar" aria-label={t("library.selected", { count: selected.size })}>
          <strong>{t("library.selected", { count: selected.size })}</strong>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => batch("forward", [...selected])}>
            {t("library.forward")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => batch("move", [...selected])}>
            {t("library.move")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => batch(tab === "archived" ? "unarchive" : "archive", [...selected])}>
            {tab === "archived" ? t("library.unarchive") : t("library.archive")}
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => batch("delete", [...selected])}>
            {t("library.delete")}
          </button>
        </div>
      )}
      {open && <FileSheet api={api} file={open} bots={byId} onAction={(action) => batch(action, [open.id])} onClose={() => setOpen(null)} />}
      {dialog?.kind === "forward" && (
        <ForwardDialog
          bots={visibleBots}
          groups={groups}
          onCancel={() => setDialog(null)}
          onPick={(to, text) => {
            const ids = dialog.ids;
            setDialog(null);
            setOpen(null);
            const name = to.botId ? byId[to.botId]?.name : groups.find((g) => g.id === to.conversationId)?.title;
            void act("forward", () => api.request("POST", "/api/v1/library/batch", { ids: ids.slice(0, 10), action: "forward", ...to, text }), t("library.forwarded", { count: Math.min(ids.length, 10), name: name ?? "" }));
          }}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog
          folders={folders}
          onCancel={() => setDialog(null)}
          onPick={(target) => {
            const ids = dialog.ids;
            setDialog(null);
            setOpen(null);
            void act("move", () => api.request("POST", "/api/v1/library/batch", { ids, action: "move", folderId: target }));
          }}
        />
      )}
      {dialog?.kind === "folder" && (
        <FolderDialog
          folder={dialog.folder}
          onCancel={() => setDialog(null)}
          onSave={(name, description) => {
            const editing = dialog.folder;
            setDialog(null);
            void act("folder", async () => {
              if (editing) await api.request("PATCH", `/api/v1/library/folders/${editing.id}`, { name, description });
              else setFolderId((await api.request<LibraryFolder>("POST", "/api/v1/library/folders", { name, description })).id);
            });
          }}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog
          folder={dialog.folder}
          bots={visibleBots}
          groups={groups}
          onCancel={() => setDialog(null)}
          onSave={(picked, pickedGroups) => {
            const id = dialog.folder.id;
            setDialog(null);
            void act("assign", () => api.request("PUT", `/api/v1/library/folders/${id}/assignees`, { bots: picked, groups: pickedGroups }));
          }}
        />
      )}
    </section>
  );
}
