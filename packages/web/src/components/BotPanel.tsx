// The bot's side panel (specs/web-app): its screen, its routines, its team and
// its brain at a glance, with the way into each full view.
import { useEffect, useState } from "react";
import type { Bot, ComputerStatus, Routine } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { MODE_ICONS } from "./ComputerModes.js";
import { Avatar, Mascot } from "./Avatar.js";
import { brainShort } from "./brains.js";
import { CheckClockIcon, CloseIcon, ExportIcon, GearIcon, PauseIcon, PlusIcon } from "./Icons.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "0 8 * * *" → "Every day at 8:00 AM"; anything unusual stays as the cron line. */
export function describeSchedule(routine: Routine, t: ReturnType<typeof useT>, lang: string): string {
  if (routine.trigger.type !== "cron") return t("routines.webhook");
  const parts = routine.trigger.cron.trim().split(/\s+/);
  if (parts.length !== 5) return routine.trigger.cron;
  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*") return t("schedule.hourly");
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour) || dom !== "*" || month !== "*") return routine.trigger.cron;
  const at = new Date(2026, 0, 1, Number(hour), Number(min)).toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
  if (dow === "*") return t("schedule.daily", { at });
  if (dow === "1-5") return t("schedule.weekdays", { at });
  if (/^[0-6]$/.test(dow)) return t("schedule.weekly", { day: t(`day.${DAYS[Number(dow)]!}` as TextKey), at });
  return routine.trigger.cron;
}

/** The latest screenshot of the bot's browser, or its wallpaper while it has none. */
function Screen({ api, bot, status }: { api: Api; bot: Bot; status: ComputerStatus | undefined }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!status?.screenshotAt) return;
    let live = true;
    let url: string | null = null;
    api
      .blob(`/api/v1/bots/${bot.id}/computer/screenshot`)
      .then((blob) => {
        if (!live || !blob) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, bot.id, status?.screenshotAt]);
  if (image) return <img src={image} alt="" className="screen-thumb" />;
  const hour = new Date().getHours();
  const phase = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  return (
    <span className={`screen-thumb wallpaper wallpaper-${phase}`}>
      <Mascot size={44} state={bot.state} />
    </span>
  );
}

export function BotPanel({
  api,
  bot,
  bots,
  status,
  routines,
  onLoadRoutines,
  onOpenComputer,
  onOpenRoutines,
  onOpenSettings,
  onOpenBot,
  onExport,
  onClose,
}: {
  api: Api;
  bot: Bot;
  bots: Record<string, Bot>;
  status: ComputerStatus | undefined;
  routines: Routine[] | undefined;
  onLoadRoutines(): Promise<void>;
  onOpenComputer(): void;
  onOpenRoutines(): void;
  onOpenSettings(): void;
  onOpenBot(id: string): void;
  onExport(): Promise<void>;
  onClose(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    void onLoadRoutines().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id]);
  const manager = bot.reportsTo ? bots[bot.reportsTo] : undefined;
  const reports = Object.values(bots).filter((b) => b.reportsTo === bot.id && !b.hidden);

  return (
    <aside className="side-panel bot-panel" aria-label={bot.name} data-testid="bot-panel">
      <header className="panel-head">
        <span className="panel-title">{bot.name}</span>
        <span className="panel-actions">
          <button className="icon-btn" aria-label={t("settings.export")} title={t("settings.export")} onClick={() => void onExport()}>
            <ExportIcon />
          </button>
          <button className="icon-btn" aria-label={t("panel.settings", { name: bot.name })} title={t("panel.settings", { name: bot.name })} onClick={onOpenSettings}>
            <GearIcon />
          </button>
          <button className="icon-btn" aria-label={t("computer.close")} title={t("computer.close")} onClick={onClose}>
            <CloseIcon />
          </button>
        </span>
      </header>

      <button className="screen-card" onClick={onOpenComputer} aria-label={t("panel.openScreen", { name: bot.name })}>
        <Screen api={api} bot={bot} status={status} />
      </button>
      <p className="screen-caption">
        {t("panel.screen", { name: bot.name })}
        {status && status.status !== "stopped" && <span className="muted"> · {t(`computer.status.${status.status}` as TextKey)}</span>}
      </p>
      {bot.computer.enabled && (
        <p className="screen-mode muted small" data-testid="computer-mode" title={bot.computer.hostDir ?? undefined}>
          {MODE_ICONS[status?.provider ?? bot.computer.provider ?? "local"]} {t(`computers.${status?.provider ?? bot.computer.provider ?? "local"}.title` as TextKey)}
          {(status?.provider ?? bot.computer.provider) === "host" && bot.computer.hostDir ? ` · ${bot.computer.hostDir}` : ""}
        </p>
      )}

      <section className="panel-section">
        <h3>{t("panel.routines")}</h3>
        <ul className="panel-routines">
          {(routines ?? []).map((r) => {
            const active = r.enabled && !r.paused;
            return (
              <li key={r.id}>
                <button className="routine-row" onClick={onOpenRoutines}>
                  <span className={`routine-icon${active ? " active" : ""}`}>{active ? <CheckClockIcon /> : <PauseIcon />}</span>
                  <span>
                    <strong>{r.name}</strong>
                    <span className="muted">{active ? describeSchedule(r, t, lang) : r.paused ? t("panel.paused") : t("panel.off")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="link add-link" onClick={onOpenRoutines}>
          <PlusIcon size={14} /> {t("panel.newRoutine")}
        </button>
      </section>

      <section className="panel-section">
        <h3>{t("panel.team")}</h3>
        {manager ? (
          <button className="team-row" onClick={() => onOpenBot(manager.id)}>
            <Avatar bot={manager} size={28} />
            <span>
              <strong>{manager.name}</strong>
              <span className="muted">{t("panel.reportsTo")}</span>
            </span>
          </button>
        ) : (
          <p className="muted small">{t("panel.noManager")}</p>
        )}
        {reports.map((r) => (
          <button key={r.id} className="team-row" onClick={() => onOpenBot(r.id)}>
            <Avatar bot={r} size={28} />
            <span>
              <strong>{r.name}</strong>
              <span className="muted">{r.role || t("panel.report")}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="panel-section">
        <h3>{t("brains.brain")}</h3>
        <p className="small">
          🧠 {brainShort(t, bot.brain.kind)}
          {bot.brain.model ? ` · ${bot.brain.model}` : ""}
        </p>
      </section>
    </aside>
  );
}
