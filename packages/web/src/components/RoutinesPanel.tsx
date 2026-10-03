// A bot's routines beside its conversation: create, test, enable, disable (specs/routines, specs/web-app).
import { useEffect, useState } from "react";
import type { Bot, Routine, RoutineApproval, RoutineTrigger } from "@orbis/shared";
import { useT } from "../i18n.js";
import { useStore } from "../store.js";

export interface RoutineInput {
  name: string;
  trigger: RoutineTrigger;
  instruction: string;
  approval: RoutineApproval;
}

const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

function RoutineRow({ routine, onAction }: { routine: Routine; onAction(action: "test" | "enable" | "disable" | "delete", force?: boolean): Promise<void> }) {
  const bots = useStore((s) => s.bots);
  const owner = bots[routine.botId];
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (action: "test" | "enable" | "disable" | "delete", force = false) => {
    setBusy(true);
    setError(null);
    try {
      await onAction(action, force);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const state = routine.enabled ? (routine.paused ? "paused" : "enabled") : "disabled";
  return (
    <li className="routine" data-testid={`routine-${routine.id}`}>
      <div className="card-head">
        <strong>{routine.name}</strong>
        <span className={`pill pill-routine-${state}`}>{t(`routines.${state}`)}</span>
      </div>
      <div className="muted routine-meta">
        {routine.trigger.type === "cron" ? `${routine.trigger.cron} · ${routine.trigger.timezone}` : t("routines.webhook")}
        {routine.approval === "draft_only" && ` · ${t("routines.draftOnly")}`}
      </div>
      <div className="muted routine-meta">
        {routine.nextRunAt && <span>{t("routines.next", { at: new Date(routine.nextRunAt).toLocaleString() })} </span>}
        {routine.lastRun && <span>{t("routines.last", { status: `${routine.lastRun.status}${routine.lastRun.test ? " (test)" : ""}` })}</span>}
        {routine.lastRun?.calledBy && <span> · {t("routines.calledBy", { name: bots[routine.lastRun.calledBy]?.name ?? "?" })}</span>}
      </div>
      {routine.enabled && owner && (
        <div className="muted routine-meta" title={t("routines.callableHelp")}>
          {t("routines.callable")}{" "}
          <code>
            @{owner.handle}/{routine.name}
          </code>
        </div>
      )}
      <div className="card-actions">
        <button className="btn" disabled={busy} onClick={() => void act("test")}>
          {t("routines.test")}
        </button>
        {routine.enabled && !routine.paused ? (
          <button className="btn" disabled={busy} onClick={() => void act("disable")}>
            {t("routines.disable")}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void act("enable")}>
            {t("routines.enable")}
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={() => void act("delete")}>
          {t("routines.delete")}
        </button>
      </div>
      {error && (
        <p className="error">
          {error}{" "}
          {/test/.test(error) && (
            <button className="link" onClick={() => void act("enable", true)}>
              {t("routines.force")}
            </button>
          )}
        </p>
      )}
    </li>
  );
}

export function RoutinesPanel({
  bot,
  routines,
  onLoad,
  onCreate,
  onAction,
  onClose,
}: {
  bot: Bot;
  routines: Routine[] | undefined;
  onLoad(): Promise<void>;
  onCreate(input: RoutineInput): Promise<Routine & { secret: string }>;
  onAction(routine: Routine, action: "test" | "enable" | "disable" | "delete", force?: boolean): Promise<void>;
  onClose(): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cron" | "webhook">("cron");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState(localZone);
  const [instruction, setInstruction] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    void onLoad().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id]);

  return (
    <aside className="computer-panel" aria-label={t("routines.title", { name: bot.name })} data-testid="routines-panel">
      <header className="computer-head">
        <h2>{t("routines.title", { name: bot.name })}</h2>
        <button className="btn" onClick={onClose} aria-label={t("computer.close")}>
          ✕
        </button>
      </header>
      {routines && routines.length === 0 && <p className="muted">{t("routines.empty")}</p>}
      <ul className="routine-list">
        {(routines ?? []).map((r) => (
          <RoutineRow key={r.id} routine={r} onAction={(action, force) => onAction(r, action, force)} />
        ))}
      </ul>
      {secret && (
        <p className="banner banner-takeover" role="status">
          {t("routines.secret", { secret })}
        </p>
      )}
      <form
        className="routine-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const created = await onCreate({
              name: name.trim(),
              instruction: instruction.trim(),
              trigger: kind === "cron" ? { type: "cron", cron: cron.trim(), timezone: timezone.trim() || "UTC" } : { type: "webhook" },
              approval: draftOnly ? "draft_only" : "normal",
            });
            setSecret(created.trigger.type === "webhook" ? created.secret : null);
            setName("");
            setInstruction("");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <label>
          {t("routines.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} name="routine-name" />
        </label>
        <label>
          {t("routines.trigger")}
          <select value={kind} onChange={(e) => setKind(e.target.value as "cron" | "webhook")} name="routine-trigger">
            <option value="cron">{t("routines.cron")}</option>
            <option value="webhook">{t("routines.webhook")}</option>
          </select>
        </label>
        {kind === "cron" && (
          <div className="form-row">
            <label>
              {t("routines.cron")}
              <input value={cron} onChange={(e) => setCron(e.target.value)} required name="routine-cron" />
            </label>
            <label>
              {t("routines.timezone")}
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} name="routine-timezone" />
            </label>
          </div>
        )}
        <label>
          {t("routines.instruction")}
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} required rows={3} name="routine-instruction" />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} name="routine-draft-only" />
          {t("routines.draftOnly")}
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={!name.trim() || !instruction.trim()}>
          {t("routines.create")}
        </button>
      </form>
    </aside>
  );
}
