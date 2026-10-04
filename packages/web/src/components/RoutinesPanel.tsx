// A bot's routines beside its conversation: create, test, enable, disable (specs/routines, specs/web-app).
// The schedule is picked and read back in words; a raw cron stays one choice among them.
import { useEffect, useState } from "react";
import type { Bot, Routine, RoutineApproval, RoutineTrigger } from "@orbis/shared";
import { ApiError } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { cronOf, DEFAULT_PICK, describeSchedule, localZone, weekdayNames, type Repeat, type SchedulePick } from "../schedule.js";
import { useStore } from "../store.js";
import { CloseIcon } from "./Icons.js";

export interface RoutineInput {
  name: string;
  trigger: RoutineTrigger;
  instruction: string;
  approval: RoutineApproval;
}

type Action = "test" | "enable" | "disable" | "delete";
const RUN_STATUSES = new Set(["done", "failed", "running", "queued", "waiting", "cancelled"]);
const REPEATS: Array<Repeat | "webhook"> = ["daily", "weekdays", "weekly", "monthly", "hourly", "custom", "webhook"];

function useWhen() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  return (trigger: RoutineTrigger) => describeSchedule(trigger, lang, (key, vars) => t(key as TextKey, vars));
}

function RoutineRow({ routine, onAction }: { routine: Routine; onAction(action: Action, force?: boolean): Promise<void> }) {
  const bots = useStore((s) => s.bots);
  const owner = bots[routine.botId];
  const t = useT();
  const lang = useLang((s) => s.lang);
  const when = useWhen();
  const [error, setError] = useState<string | null>(null);
  const [untested, setUntested] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (action: Action, force = false) => {
    if (action === "delete" && !window.confirm(t("routines.confirmDelete", { name: routine.name }))) return;
    setBusy(true);
    setError(null);
    setUntested(false);
    try {
      await onAction(action, force);
    } catch (err) {
      if (action === "enable" && err instanceof ApiError && err.status === 409 && err.body?.error.code === "untested") setUntested(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const state = routine.enabled ? (routine.paused ? "paused" : "enabled") : "disabled";
  const at = (iso: string) => new Date(iso).toLocaleString(lang, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const status = (s: string) => (RUN_STATUSES.has(s) ? t(`routines.status.${s}` as TextKey) : s);
  return (
    <li className="routine" data-testid={`routine-${routine.id}`}>
      <div className="routine-top">
        <strong>{routine.name}</strong>
        <span className={`pill pill-routine-${state}`}>{t(`routines.${state}`)}</span>
      </div>
      <p className="routine-when" data-testid="routine-when">
        ⏰ {when(routine.trigger)}
        {routine.approval === "draft_only" && <span className="muted"> · {t("routines.draftOnly")}</span>}
      </p>
      <p className="routine-instruction muted">{routine.instruction}</p>
      {(routine.nextRunAt || routine.lastRun) && (
        <p className="muted routine-meta">
          {routine.nextRunAt && <span>{t("routines.next", { at: at(routine.nextRunAt) })}</span>}
          {routine.nextRunAt && routine.lastRun && " · "}
          {routine.lastRun && (
            <span>
              {t("routines.last", { status: `${status(routine.lastRun.status)}${routine.lastRun.test ? ` (${t("routines.test.tag")})` : ""}` })}
              {routine.lastRun.calledBy && ` · ${t("routines.calledBy", { name: bots[routine.lastRun.calledBy]?.name ?? "?" })}`}
            </span>
          )}
        </p>
      )}
      {routine.enabled && owner && (
        <p className="muted routine-meta" title={t("routines.callableHelp")}>
          {t("routines.callable")}{" "}
          <code>
            @{owner.handle}/{routine.name}
          </code>
        </p>
      )}
      <div className="routine-actions">
        <button className="btn btn-sm" disabled={busy} onClick={() => void act("test")}>
          {t("routines.test")}
        </button>
        {routine.enabled && !routine.paused ? (
          <button className="btn btn-sm" disabled={busy} onClick={() => void act("disable")}>
            {t("routines.disable")}
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act("enable")}>
            {t("routines.enable")}
          </button>
        )}
        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => void act("delete")}>
          {t("routines.delete")}
        </button>
      </div>
      {untested && (
        <div className="notice routine-untested" role="status">
          <p>{t("routines.untested")}</p>
          <div className="routine-actions">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act("test")}>
              {t("routines.test")}
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => void act("enable", true)}>
              {t("routines.force")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
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
  onAction(routine: Routine, action: Action, force?: boolean): Promise<void>;
  onClose(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const when = useWhen();
  const [name, setName] = useState("");
  const [repeat, setRepeat] = useState<Repeat | "webhook">(DEFAULT_PICK.repeat);
  const [pick, setPick] = useState<SchedulePick>(DEFAULT_PICK);
  const [timezone, setTimezone] = useState(localZone);
  const [instruction, setInstruction] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const days = weekdayNames(lang, "short");

  useEffect(() => {
    void onLoad().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id]);

  const trigger: RoutineTrigger = repeat === "webhook" ? { type: "webhook" } : { type: "cron", cron: cronOf({ ...pick, repeat }), timezone: timezone.trim() || "UTC" };
  const set = (patch: Partial<SchedulePick>) => setPick((p) => ({ ...p, ...patch }));
  const timed = repeat === "daily" || repeat === "weekdays" || repeat === "weekly" || repeat === "monthly";
  const ready = name.trim() && instruction.trim() && (repeat !== "weekly" || pick.days.length > 0) && (repeat !== "custom" || pick.cron.trim());

  return (
    <aside className="side-panel routines-panel" aria-label={t("routines.title", { name: bot.name })} data-testid="routines-panel">
      <header className="panel-head">
        <span className="panel-title">{t("routines.title", { name: bot.name })}</span>
        <button className="icon-btn" onClick={onClose} aria-label={t("computer.close")} title={t("computer.close")}>
          <CloseIcon />
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
            const created = await onCreate({ name: name.trim(), instruction: instruction.trim(), trigger, approval: draftOnly ? "draft_only" : "normal" });
            setSecret(created.trigger.type === "webhook" ? created.secret : null);
            setName("");
            setInstruction("");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <h3>{t("routines.new")}</h3>
        <label>
          {t("routines.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} name="routine-name" />
        </label>
        <label>
          {t("routines.what")}
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            required
            rows={3}
            name="routine-instruction"
            placeholder={t("routines.whatPlaceholder")}
          />
        </label>
        <label>
          {t("routines.when")}
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat | "webhook")} name="routine-repeat">
            {REPEATS.map((r) => (
              <option key={r} value={r}>
                {t(`routines.repeat.${r}` as TextKey)}
              </option>
            ))}
          </select>
        </label>
        {repeat === "weekly" && (
          <fieldset className="day-picks">
            <legend>{t("routines.days")}</legend>
            {days.map((label, d) => (
              <button
                key={d}
                type="button"
                className={`day-pick${pick.days.includes(d) ? " on" : ""}`}
                aria-pressed={pick.days.includes(d)}
                onClick={() => set({ days: pick.days.includes(d) ? pick.days.filter((x) => x !== d) : [...pick.days, d] })}
              >
                {label.replace(/\.$/, "")}
              </button>
            ))}
          </fieldset>
        )}
        {(timed || repeat === "hourly") && (
          <div className="form-row">
            {timed && (
              <label>
                {t("routines.at")}
                <input type="time" value={pick.time} onChange={(e) => set({ time: e.target.value || "09:00" })} required name="routine-time" />
              </label>
            )}
            {repeat === "monthly" && (
              <label>
                {t("routines.dayOfMonth")}
                <input type="number" min={1} max={31} value={pick.day} onChange={(e) => set({ day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} name="routine-day" />
              </label>
            )}
            {repeat === "hourly" && (
              <label>
                {t("routines.minute")}
                <input type="number" min={0} max={59} value={pick.minute} onChange={(e) => set({ minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })} name="routine-minute" />
              </label>
            )}
          </div>
        )}
        {repeat === "custom" && (
          <label>
            {t("routines.cron")}
            <input value={pick.cron} onChange={(e) => set({ cron: e.target.value })} required name="routine-cron" />
            <span className="muted small field-help">{t("routines.cronHelp")}</span>
          </label>
        )}
        {repeat !== "webhook" && (
          <label>
            {t("routines.timezone")}
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} name="routine-timezone" />
          </label>
        )}
        <p className="muted small routine-preview" data-testid="routine-preview">
          {t("routines.preview", { when: when(trigger) })}
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} name="routine-draft-only" />
          <span>
            {t("routines.draftOnly")}
            <span className="muted small field-help">{t("routines.draftOnlyHelp")}</span>
          </span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={!ready}>
          {t("routines.create")}
        </button>
      </form>
    </aside>
  );
}
