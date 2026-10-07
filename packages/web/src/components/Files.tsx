// Files in conversations (specs/web-app, change 0059-files-conversations-sends-bots): what a message carries
// — images shown in place and opened large, audio and video played, any other file as a card to download —
// the chips of the files about to be sent, and the list of a conversation's files.
import { useEffect, useState } from "react";
import type { Bot, ConversationFile } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { androidApp, androidCan } from "../native.js";
import { useStore } from "../store.js";
import { BackIcon, CloseIcon, DownloadIcon, FileIcon } from "./Icons.js";

/** The largest file the hub keeps (MAX_FILE_BYTES of the hub). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** The most files one message carries. */
export const MAX_FILES = 10;

export function formatSize(bytes: number, lang: string): string {
  const n = (value: number) => value.toLocaleString(lang, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${n(bytes / 1024)} KB`;
  return `${n(bytes / (1024 * 1024))} MB`;
}

const isImage = (mime: string) => /^image\/(png|jpeg|gif|webp|bmp)$/.test(mime);

/** What a file is, for its card: the extension the user knows (PDF, XLSX…). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 5) : "";
}

/** Save a file of a conversation: to Downloads in the Android app, as a download in a browser. */
export async function saveFile(api: Api, file: ConversationFile): Promise<void> {
  const android = androidApp();
  if (android && androidCan("saveFile")) {
    const res = await fetch(api.fileUrl(file.id, true));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    android.saveFile!(file.name, file.mime, btoa(binary));
    return;
  }
  const link = document.createElement("a");
  link.href = api.fileUrl(file.id, true);
  link.download = file.name;
  link.rel = "noopener";
  link.click();
}

function FileCard({ api, file, onError }: { api: Api; file: ConversationFile; onError(message: string): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  return (
    <button
      type="button"
      className="file-card"
      onClick={() => void saveFile(api, file).catch((err) => onError(err instanceof Error ? err.message : String(err)))}
      title={t("files.download", { name: file.name })}
      data-testid="file-card"
    >
      <span className="file-card-icon">
        <FileIcon size={22} />
        {extensionOf(file.name) && <span className="file-ext">{extensionOf(file.name)}</span>}
      </span>
      <span className="file-card-text">
        <strong>{file.name}</strong>
        <span className="muted">{formatSize(file.size, lang)}</span>
      </span>
      <DownloadIcon size={18} />
    </button>
  );
}

/** An image opened large, over everything, with its download. */
function ImageViewer({ api, file, onClose }: { api: Api; file: ConversationFile; onClose(): void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="image-viewer" role="dialog" aria-label={file.name} onClick={onClose} data-testid="image-viewer">
      <div className="image-viewer-bar" onClick={(e) => e.stopPropagation()}>
        <span className="image-viewer-name">{file.name}</span>
        <button type="button" className="icon-btn" aria-label={t("files.download", { name: file.name })} onClick={() => void saveFile(api, file)}>
          <DownloadIcon />
        </button>
        <button type="button" className="icon-btn" aria-label={t("computer.close")} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <img src={api.fileUrl(file.id)} alt={file.name} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/** The files a message carries, inside its bubble. */
export function FileAttachments({ files }: { files: ConversationFile[] }) {
  const api = useStore((s) => s.api);
  const [open, setOpen] = useState<ConversationFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  if (!api || files.length === 0) return null;
  const images = files.filter((f) => isImage(f.mime));
  const others = files.filter((f) => !isImage(f.mime));
  return (
    <div className="attachments" data-testid="attachments">
      {images.length > 0 && (
        <div className={`attachment-images${images.length > 1 ? " grid" : ""}`}>
          {images.map((file) => (
            <button key={file.id} type="button" className="attachment-image" onClick={() => setOpen(file)} aria-label={t("files.open", { name: file.name })}>
              <img src={api.fileUrl(file.id)} alt={file.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {others.map((file) =>
        file.mime.startsWith("audio/") ? (
          <figure key={file.id} className="attachment-media">
            <audio controls preload="none" src={api.fileUrl(file.id)} aria-label={file.name} />
            <FileCard api={api} file={file} onError={setError} />
          </figure>
        ) : file.mime.startsWith("video/") ? (
          <figure key={file.id} className="attachment-media">
            <video controls preload="metadata" src={api.fileUrl(file.id)} aria-label={file.name} />
            <FileCard api={api} file={file} onError={setError} />
          </figure>
        ) : (
          <FileCard key={file.id} api={api} file={file} onError={setError} />
        ),
      )}
      {error && <p className="error">{t("files.saveFailed", { error })}</p>}
      {open && <ImageViewer api={api} file={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The files about to be sent, under the message box: a thumbnail or a name, and a way to take each out. */
export function PendingFiles({ files, onRemove }: { files: File[]; onRemove(index: number): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [previews, setPreviews] = useState<Array<string | null>>([]);
  useEffect(() => {
    const urls = files.map((f) => {
      if (!isImage(f.type)) return null;
      try {
        return URL.createObjectURL(f);
      } catch {
        return null;
      }
    });
    setPreviews(urls);
    return () => {
      for (const url of urls) if (url) URL.revokeObjectURL(url);
    };
  }, [files]);
  if (files.length === 0) return null;
  return (
    <ul className="pending-files" aria-label={t("files.pending")} data-testid="pending-files">
      {files.map((file, i) => (
        <li key={`${file.name}-${i}`} className="pending-file">
          {previews[i] ? <img src={previews[i]!} alt="" /> : <FileIcon size={18} />}
          <span className="pending-file-text">
            <span className="pending-file-name">{file.name}</span>
            <span className="muted">{formatSize(file.size, lang)}</span>
          </span>
          <button type="button" className="icon-btn" aria-label={t("files.remove", { name: file.name })} onClick={() => onRemove(i)}>
            <CloseIcon size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A conversation's files: images in a grid, the rest in a list, each with who sent it and when. */
export function FilesPanel({
  api,
  conversationId,
  bots,
  refreshKey,
  title,
  onClose,
  onBack,
  onShowItem,
}: {
  api: Api;
  conversationId: string;
  bots: Record<string, Bot>;
  /** Changes when the conversation moves on, so the list loads again. */
  refreshKey?: string | null;
  title?: string;
  onClose?(): void;
  onBack?(): void;
  onShowItem?(itemId: string): Promise<void>;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [files, setFiles] = useState<ConversationFile[] | null>(null);
  const [open, setOpen] = useState<ConversationFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api
      .get<ConversationFile[]>(`/api/v1/conversations/${conversationId}/files`)
      .then((found) => live && setFiles(found))
      .catch((err) => {
        if (!live) return;
        setFiles([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [api, conversationId, refreshKey]);
  const who = (f: ConversationFile) => (f.author.type === "user" ? t("group.you") : f.author.type === "bot" ? (bots[f.author.id ?? ""]?.name ?? "bot") : "Orbis");
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  const images = (files ?? []).filter((f) => isImage(f.mime));
  const others = (files ?? []).filter((f) => !isImage(f.mime));
  return (
    <aside className="side-panel files-panel" aria-label={title ?? t("files.title")} data-testid="files-panel">
      <header className="panel-head">
        {onBack ? (
          <button type="button" className="icon-btn" aria-label={t("group.back")} onClick={onBack}>
            <BackIcon />
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label={t("computer.close")} onClick={onClose}>
            <CloseIcon />
          </button>
        )}
        <span className="panel-title">{title ?? t("files.title")}</span>
        <span className="spacer" />
      </header>
      {error && <p className="error">{error}</p>}
      {files === null ? (
        <p className="muted">{t("timeline.loading")}</p>
      ) : files.length === 0 ? (
        <p className="muted files-empty">{t("files.none")}</p>
      ) : (
        <>
          {images.length > 0 && (
            <div className="files-grid">
              {images.map((file) => (
                <button key={file.id} type="button" className="attachment-image" onClick={() => setOpen(file)} aria-label={t("files.open", { name: file.name })}>
                  <img src={api.fileUrl(file.id)} alt={file.name} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <ul className="files-list">
            {others.map((file) => (
              <li key={file.id}>
                <FileCard api={api} file={file} onError={setError} />
                {onShowItem && file.itemId ? (
                  <button type="button" className="link" onClick={() => void onShowItem(file.itemId!)}>
                    {who(file)} · {date(file.createdAt)}
                  </button>
                ) : (
                  <span className="muted">
                    {who(file)} · {date(file.createdAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {open && <ImageViewer api={api} file={open} onClose={() => setOpen(null)} />}
    </aside>
  );
}
