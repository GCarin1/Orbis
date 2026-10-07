// Settings → Health (specs/web-app, change 0062-health-connect): inside the Android app, Health Connect's state,
// allowing it, syncing now or on its own; anywhere, what the hub keeps (the last sync, its apps, the last 7
// days), which bots may read it, and wiping it.
import { useEffect, useState } from "react";
import type { Bot, HealthDay, HealthStatus } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { androidApp, healthGrant } from "../native.js";
import { canReadHealth, healthAuto, setHealthAuto, syncHealth } from "../health.js";
import { Avatar } from "./Avatar.js";

/** The kinds of data the app asks for (its 11 read permissions). */
export const HEALTH_PERMISSION_COUNT = 11;

/** The apps that write to Health Connect, by their package names. */
const APP_NAMES: Record<string, string> = {
  "com.huami.watch.hmwatchmanager": "Zepp (Amazfit)",
  "com.sec.android.app.shealth": "Samsung Health",
  "com.google.android.apps.fitness": "Google Fit",
  "com.fitbit.FitbitMobile": "Fitbit",
  "com.mi.health": "Mi Fitness",
  "com.xiaomi.wearable": "Mi Fitness",
  "com.garmin.android.apps.connectmobile": "Garmin Connect",
  "com.huawei.health": "Huawei Health",
  "com.google.android.apps.healthdata": "Health Connect",
  "com.android.healthconnect.controller": "Health Connect",
  "com.withings.wiscale2": "Withings",
  "com.ouraring.oura": "Oura",
};

export const appName = (pkg: string) => APP_NAMES[pkg] ?? pkg;

const hours = (minutes: number | undefined) => (minutes === undefined ? "—" : `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, "0")}`);

export function HealthSettings({ api, bots }: { api: Api; bots: Bot[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [days, setDays] = useState<HealthDay[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [granted, setGranted] = useState<string[] | null>(null);
  const [auto, setAuto] = useState(healthAuto());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inApp = canReadHealth();

  const reload = async () => {
    const [s, summary] = await Promise.all([api.get<HealthStatus>("/api/v1/health/status"), api.get<{ days: HealthDay[] }>("/api/v1/health/summary?days=7")]);
    setStatus(s);
    setDays(summary.days);
  };

  useEffect(() => {
    void reload().catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) }));
    if (!inApp) return;
    const state = androidApp()?.healthStatus?.() ?? "unavailable";
    setPhone(state);
    if (state === "available") void healthGrant().then((g) => setGranted(g.granted ?? [])).catch(() => setGranted([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await fn();
      if (done) setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const allow = () =>
    act(async () => {
      const answer = await healthGrant(true);
      if (answer.error) throw new Error(answer.error);
      setGranted(answer.granted ?? []);
    });
  const sync = () =>
    act(async () => {
      const next = await syncHealth(api);
      setStatus(next);
      await reload();
      return t("health.synced", { days: next.days });
    });
  const access = (bot: Bot, on: boolean) =>
    act(async () => {
      await api.post("/api/v1/health/bots", { botId: bot.id, enabled: on });
      await reload();
    });
  const wipe = () => {
    if (!window.confirm(t("health.confirmWipe"))) return;
    void act(async () => {
      await api.delete("/api/v1/health");
      await reload();
      return t("health.wiped");
    });
  };

  const visible = bots.filter((b) => !b.hidden);
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="health-settings" data-testid="health-settings">
      <h2>{t("health.title")}</h2>
      <p className="muted">{t("health.intro")}</p>

      <section className="health-card" data-testid="health-phone">
        <h3>{t("health.phone")}</h3>
        {!inApp ? (
          <p className="muted">{t("health.openApp")}</p>
        ) : phone === "unavailable" ? (
          <p className="muted">{t("health.unavailable")}</p>
        ) : phone === "update" ? (
          <>
            <p className="muted">{t("health.needsUpdate")}</p>
            <button type="button" className="btn btn-primary" onClick={() => androidApp()?.openHealthConnect?.()}>
              {t("health.install")}
            </button>
          </>
        ) : (
          <>
            <p data-testid="health-granted">
              {granted === null ? t("timeline.loading") : t("health.granted", { count: granted.length, total: HEALTH_PERMISSION_COUNT })}
            </p>
            <div className="card-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void allow()}>
                {granted?.length ? t("health.allowMore") : t("health.allow")}
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || !granted?.length} onClick={() => void sync()}>
                {t("health.syncNow")}
              </button>
              <button type="button" className="btn" onClick={() => androidApp()?.openHealthConnect?.()}>
                {t("health.openSettings")}
              </button>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setHealthAuto(e.target.checked);
                  setAuto(e.target.checked);
                }}
                name="health-auto"
              />
              {t("health.auto")}
            </label>
          </>
        )}
      </section>

      <section className="health-card" data-testid="health-status">
        <h3>{t("health.kept")}</h3>
        {!status ? (
          <p className="muted">{t("timeline.loading")}</p>
        ) : status.days === 0 ? (
          <p className="muted">{t("health.none")}</p>
        ) : (
          <>
            <p className="muted small">
              {t("health.lastSync", { when: status.lastSyncAt ? when(status.lastSyncAt) : "—", days: status.days })}
              {status.sources.length > 0 && ` · ${t("health.from", { apps: [...new Set(status.sources.map(appName))].join(", ") })}`}
            </p>
            <div className="table-scroll">
              <table className="usage-table health-table">
                <thead>
                  <tr>
                    <th>{t("health.col.date")}</th>
                    <th>{t("health.col.steps")}</th>
                    <th>{t("health.col.sleep")}</th>
                    <th>{t("health.col.resting")}</th>
                    <th>{t("health.col.active")}</th>
                    <th>{t("health.col.exercise")}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td>{new Date(`${d.date}T12:00:00`).toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })}</td>
                      <td>{d.metrics.steps !== undefined ? Math.round(d.metrics.steps).toLocaleString(lang) : "—"}</td>
                      <td>{hours(d.metrics.sleep_minutes)}</td>
                      <td>{d.metrics.resting_heart_rate !== undefined ? `${Math.round(d.metrics.resting_heart_rate)} bpm` : "—"}</td>
                      <td>{d.metrics.active_kcal !== undefined ? `${Math.round(d.metrics.active_kcal)} kcal` : "—"}</td>
                      <td>{d.metrics.exercise_minutes !== undefined ? `${Math.round(d.metrics.exercise_minutes)} min` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="health-card" data-testid="health-bots">
        <h3>{t("health.bots")}</h3>
        <p className="muted small">{t("health.botsHint")}</p>
        <div className="bot-toggles">
          {visible.map((bot) => {
            const on = status?.bots.includes(bot.id) ?? false;
            return (
              <label key={bot.id} className={`bot-toggle${on ? " on" : ""}`}>
                <input type="checkbox" checked={on} disabled={busy || !status} onChange={(e) => void access(bot, e.target.checked)} />
                <Avatar bot={bot} size={20} /> {bot.name}
              </label>
            );
          })}
        </div>
      </section>

      {message && (
        <p className={message.ok ? "muted" : "error"} role="status">
          {message.text}
        </p>
      )}
      <div className="card-actions">
        <button type="button" className="btn btn-danger" disabled={busy || !status?.days} onClick={wipe}>
          {t("health.wipe")}
        </button>
      </div>
    </div>
  );
}
