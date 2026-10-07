// A bot's initiative (specs/web-app, change 0060-bot-initiative): Settings → Initiative holds the switch for
// every bot and the quiet hours; each bot's settings hold its own switch, how often it writes, whether it
// answers its MCP servers' updates, and a way to give it its chance now.
import { useEffect, useState } from "react";
import { INITIATIVE_FREQUENCIES, type Bot, type BotInitiative, type InitiativeFrequency, type InitiativeSettings } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Settings → Initiative: every bot's switch and the quiet hours, in the user's timezone. */
export function InitiativeSettingsTab({ api }: { api: Api }) {
  const t = useT();
  const [settings, setSettings] = useState<InitiativeSettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    api
      .get<InitiativeSettings>("/api/v1/initiative")
      .then((found) => live && setSettings(found))
      .catch((err) => live && setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [api]);
  if (!settings) return message ? <p className="error">{message.text}</p> : <p className="muted">{t("timeline.loading")}</p>;
  const timezone = browserTimezone();
  const save = async (patch: Partial<InitiativeSettings>) => {
    setMessage(null);
    try {
      // The quiet hours are the user's: always in the timezone of the device they set them on.
      setSettings(await api.put<InitiativeSettings>("/api/v1/initiative", { ...patch, timezone }));
      setMessage({ ok: true, text: t("settings.saved") });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <div className="initiative-settings" data-testid="initiative-settings">
      <h2>{t("initiative.title")}</h2>
      <p className="muted">{t("initiative.intro")}</p>
      <label className="checkbox">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => void save({ enabled: e.target.checked })} name="initiative-enabled" />
        {t("initiative.everyone")}
      </label>
      <fieldset className="quiet-hours">
        <legend>{t("initiative.quiet")}</legend>
        <label>
          {t("initiative.quietFrom")}
          <input type="time" value={settings.quietStart} onChange={(e) => e.target.value && void save({ quietStart: e.target.value })} name="initiative-quiet-start" />
        </label>
        <label>
          {t("initiative.quietTo")}
          <input type="time" value={settings.quietEnd} onChange={(e) => e.target.value && void save({ quietEnd: e.target.value })} name="initiative-quiet-end" />
        </label>
        <p className="muted small">{t("initiative.quietHint", { timezone: settings.timezone })}</p>
      </fieldset>
      <p className="muted small">{t("initiative.perBot")}</p>
      {message && (
        <p className={message.ok ? "muted" : "error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

/** The bot's own initiative, inside its settings form: the values travel with the form's Save. */
export function BotInitiativeFields({
  api,
  bot,
  value,
  onChange,
}: {
  api?: Api | null;
  bot: Bot;
  value: BotInitiative;
  onChange(next: BotInitiative): void;
}) {
  const t = useT();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const tryNow = async () => {
    setNote(null);
    try {
      await api!.post(`/api/v1/bots/${bot.id}/initiative/now`);
      setNote({ ok: true, text: t("initiative.tried", { name: bot.name }) });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <fieldset data-testid="bot-initiative">
      <legend>{t("initiative.legend")}</legend>
      <label className="checkbox">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} name="settings-initiative" />
        {t("initiative.enable", { name: bot.name })}
      </label>
      <p className="muted small">{t("initiative.hint")}</p>
      <label>
        {t("initiative.frequency")}
        <select
          value={value.frequency}
          disabled={!value.enabled}
          onChange={(e) => onChange({ ...value, frequency: e.target.value as InitiativeFrequency })}
          name="settings-initiative-frequency"
        >
          {INITIATIVE_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(`initiative.frequency.${f}` as TextKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.mcpUpdates}
          disabled={!value.enabled}
          onChange={(e) => onChange({ ...value, mcpUpdates: e.target.checked })}
          name="settings-initiative-mcp"
        />
        {t("initiative.mcp")}
      </label>
      {api && (
        <div className="card-actions">
          <button type="button" className="btn" onClick={() => void tryNow()}>
            {t("initiative.tryNow")}
          </button>
        </div>
      )}
      {note && (
        <p className={note.ok ? "muted" : "error"} role="status">
          {note.text}
        </p>
      )}
    </fieldset>
  );
}
