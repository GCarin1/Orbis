// A Library folder's task and its board (specs/web-app, change 0080-folder-tasks): what the team should do
// with the folder, each bot's step as it goes, a way to the team's conversation, and the result with the files
// the team kept — live, as the hub says each move.
import { useEffect, useState } from "react";
import type { Bot, FolderTask, LibraryFolder } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { useStore } from "../store.js";
import { Avatar } from "./Avatar.js";
import { Markdown } from "./Markdown.js";

const STEP_ICON = { pending: "⏳", doing: "🔄", done: "✅", failed: "⚠️" } as const;

export function FolderTaskBoard({ api, folder, bots, onOpenConversation }: { api: Api; folder: LibraryFolder; bots: Record<string, Bot>; onOpenConversation?(conversationId: string): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const version = useStore((s) => s.libraryVersion);
  const [tasks, setTasks] = useState<FolderTask[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<FolderTask[]>(`/api/v1/library/folders/${folder.id}/tasks`)
      .then((list) => live && setTasks(list))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [api, folder.id, version]);

  const latest = tasks[0] ?? null;
  const running = latest?.status === "running";
  const hasTeam = folder.bots.length + folder.groups.length > 0;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="folder-task" aria-label={t("task.title")} data-testid="folder-task">
      {!running && (
        <form
          className="folder-task-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void run(async () => {
              const task = await api.request<FolderTask>("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text: text.trim() });
              setTasks((list) => [task, ...list]);
              setText("");
            });
          }}
        >
          <label>
            {t("task.new")}
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("task.placeholder")} disabled={!hasTeam} />
          </label>
          {!hasTeam && <p className="muted small">{t("task.needTeam")}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !hasTeam || !text.trim()}>
            {t("task.start")}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {latest && <TaskCard api={api} task={latest} bots={bots} lang={lang} busy={busy} onCancel={() => void run(() => api.request("POST", `/api/v1/library/tasks/${latest.id}/cancel`))} onOpenConversation={onOpenConversation} />}
      {tasks.length > 1 && (
        <button type="button" className="link" onClick={() => setHistory((h) => !h)} aria-expanded={history}>
          {history ? t("task.hideHistory") : t("task.showHistory", { count: tasks.length - 1 })}
        </button>
      )}
      {history && tasks.slice(1).map((task) => <TaskCard key={task.id} api={api} task={task} bots={bots} lang={lang} busy={busy} compact onOpenConversation={onOpenConversation} />)}
    </section>
  );
}

function TaskCard({
  api,
  task,
  bots,
  lang,
  busy,
  compact = false,
  onCancel,
  onOpenConversation,
}: {
  api: Api;
  task: FolderTask;
  bots: Record<string, Bot>;
  lang: string;
  busy: boolean;
  compact?: boolean;
  onCancel?(): void;
  onOpenConversation?(conversationId: string): void;
}) {
  const t = useT();
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <article className={`task-card task-${task.status}`} data-testid="task-card">
      <header className="task-card-head">
        <strong>{t(`task.status.${task.status}`)}</strong>
        <span className="muted small">{when(task.createdAt)}</span>
        <span className="spacer" />
        {task.conversationId && onOpenConversation && (
          <button type="button" className="btn btn-sm" onClick={() => onOpenConversation(task.conversationId!)}>
            {t("task.openConversation")}
          </button>
        )}
        {task.status === "running" && onCancel && (
          <button type="button" className="btn btn-sm btn-danger" onClick={onCancel} disabled={busy}>
            {t("task.cancel")}
          </button>
        )}
      </header>
      <p className="task-text">{task.text}</p>
      {!compact && (
        <ul className="task-steps" aria-label={t("task.steps")}>
          {task.steps.map((step) => {
            const bot = bots[step.botId];
            return (
              <li key={step.botId} className={`task-step step-${step.status}`}>
                {bot ? <Avatar bot={bot} size={24} /> : null}
                <span className="task-step-name">
                  {bot?.name ?? step.botId}
                  {task.leadBotId === step.botId && <span className="muted small"> · {t("task.lead")}</span>}
                </span>
                <span className="task-step-status" title={t(`task.step.${step.status}`)}>
                  {STEP_ICON[step.status]} {t(`task.step.${step.status}`)}
                </span>
                {step.note && <span className="task-step-note muted small">{step.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {task.status !== "running" && task.result && (
        <div className="task-result">
          <strong>{t("task.result")}</strong>
          <Markdown text={task.result} bots={Object.values(bots)} />
        </div>
      )}
      {task.files.length > 0 && (
        <p className="muted small">
          {t("task.files", { count: task.files.length })}{" "}
          {task.files.slice(0, 6).map((id) => (
            <a key={id} href={api.fileUrl(id, true)} className="task-file" rel="noopener">
              📎
            </a>
          ))}
        </p>
      )}
    </article>
  );
}
