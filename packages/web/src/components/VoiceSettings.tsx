// Voice and appearance settings (specs/web-app): the theme and the language;
// whether this browser takes dictation; reading replies aloud; and the hub's
// transcription service for browsers that cannot take dictation.
import { useEffect, useState } from "react";
import type { TranscriptionStatus, TranscriptionTestResult } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { canSpeak, dictationCtor, isDesktopShell, speak, useVoice } from "../voice.js";
import { LanguageSwitch } from "./LanguageSwitch.js";
import { ThemeChoice } from "./ThemeSwitch.js";
import { androidApp } from "../native.js";

export function VoiceSettings({ api }: { api: Api }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { readAloud, setReadAloud, transcription, setTranscription } = useVoice();
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TranscriptionTestResult | "pending" | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get<{ transcription: TranscriptionStatus }>("/api/v1/voice")
      .then((voice) => {
        if (!live) return;
        setTranscription(voice.transcription);
        if (voice.transcription.source === "settings") {
          setUrl(voice.transcription.url ?? "");
          setModel(voice.transcription.model ?? "");
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, setTranscription]);

  const save = async (body: { url?: string | null; model?: string | null; apiKey?: string | null }) => {
    setSaving(true);
    setError(null);
    setTest(null);
    try {
      const voice = await api.put<{ transcription: TranscriptionStatus }>("/api/v1/voice/transcription", body);
      setTranscription(voice.transcription);
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest("pending");
    try {
      setTest(await api.post<TranscriptionTestResult>("/api/v1/voice/test"));
    } catch (err) {
      setTest({ ok: false, text: "", durationMs: 0, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const dictation = dictationCtor() !== null;
  const source = transcription?.source;

  const android = androidApp();

  return (
    <div className="settings-section" data-testid="voice-settings">
      {android && (
        <div className="android-card" data-testid="android-card">
          <h2>{t("android.title")}</h2>
          <p className="muted">
            {t("android.connected", { url: android.hubUrl() })} · {t("android.version", { version: android.version() })}
          </p>
          <button type="button" className="btn" onClick={() => android.changeHub()}>
            {t("android.changeHub")}
          </button>
        </div>
      )}
      <h2>{t("appearance.title")}</h2>
      <div className="prefs-form">
        <div>
          <p className="field-label">{t("theme.label")}</p>
          <ThemeChoice />
        </div>
        <label>
          {t("lang.label")}
          <LanguageSwitch />
        </label>
      </div>

      <h2>{t("voice.title")}</h2>
      <p className="muted">{t("voice.help")}</p>
      <p data-testid="dictation-status">
        <span className={`badge ${dictation ? "ok" : "off"}`}>{dictation ? `✓ ${t("voice.dictation.on")}` : `✗ ${t("voice.dictation.off")}`}</span>{" "}
        <span className="muted small">
          {dictation ? t("voice.dictation.onHelp") : t(isDesktopShell() ? "voice.dictation.desktop" : "voice.dictation.offHelp")}
        </span>
      </p>
      {canSpeak() && (
        <div className="card-actions">
          <label className="check">
            <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> {t("voice.readAloud")}
          </label>
          <button type="button" className="btn" onClick={() => speak(t("voice.sample"), lang)}>
            {t("voice.try")}
          </button>
        </div>
      )}

      <h2>{t("voice.service")}</h2>
      <p className="muted">{t("voice.serviceHelp")}</p>
      <p data-testid="transcription-status">
        <span className={`badge ${transcription?.configured ? "ok" : "off"}`}>
          {transcription?.configured ? `✓ ${t(`voice.source.${source}` as TextKey)}` : `✗ ${t("voice.notConfigured")}`}
        </span>{" "}
        {transcription?.configured && (
          <span className="muted small">
            <code>{transcription.url}</code> · {transcription.model}
            {transcription.hasKey ? ` · ${t("voice.keySaved")}` : ""}
          </span>
        )}
      </p>
      <form
        className="prefs-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ url: url.trim() || null, model: model.trim() || null, ...(apiKey ? { apiKey } : {}) });
        }}
      >
        <label>
          {t("voice.url")}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.openai.com/v1" name="transcribe-url" inputMode="url" />
        </label>
        <label>
          {t("voice.model")}
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="whisper-1" name="transcribe-model" />
        </label>
        <label>
          {t("voice.key")}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={transcription?.hasKey && source === "settings" ? "••••••••" : t("voice.keyPlaceholder")}
            name="transcribe-key"
            autoComplete="off"
          />
        </label>
        <ul className="muted small voice-examples">
          <li>{t("voice.example.openai")}</li>
          <li>{t("voice.example.groq")}</li>
          <li>{t("voice.example.local")}</li>
        </ul>
        <div className="card-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {t("voice.save")}
          </button>
          <button className="btn" type="button" disabled={!transcription?.configured || test === "pending"} onClick={() => void runTest()}>
            {t("brains.test")}
          </button>
          {source === "settings" && (
            <button
              className="btn"
              type="button"
              disabled={saving}
              onClick={() => {
                setUrl("");
                setModel("");
                void save({ url: null, model: null, apiKey: null });
              }}
            >
              {t("voice.clear")}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {test === "pending" && <p className="muted">…</p>}
        {test && test !== "pending" && (
          <p className={`brain-test ${test.ok ? "answered" : "failed"}`} data-testid="transcription-test">
            {test.ok ? t("voice.testOk", { ms: test.durationMs }) : t("voice.testFailed", { error: test.error ?? "?" })}
          </p>
        )}
      </form>
    </div>
  );
}
