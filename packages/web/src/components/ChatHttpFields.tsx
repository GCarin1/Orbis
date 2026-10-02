// The chat-http brain's fields (specs/web-app): the chat API's address and its
// Bearer token, typed or read from a pasted "Copy as cURL" command, plus the
// request's settings. The token never goes into the bot itself: it is saved as
// the bot's secret, encrypted in the hub's vault.
import { useState } from "react";
import { CHAT_HTTP_DEFAULT_MODEL, CHAT_HTTP_TOKEN_SECRET, parseCurl, tokenExpiry, type Brain } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";

export interface ChatHttpValue {
  url: string;
  /** A new token to save; empty keeps the one already saved. */
  token: string;
  model: string;
  agentId: string;
  agentVersion: string;
  temperature: string;
  origin: string;
  historyUrl: string;
}

export const chatHttpValue = (brain?: Brain): ChatHttpValue => ({
  url: brain?.kind === "chat-http" ? (brain.baseUrl ?? "") : "",
  token: "",
  model: brain?.kind === "chat-http" ? (brain.model ?? "") : "",
  agentId: brain?.chat?.agentId ?? "",
  agentVersion: brain?.chat?.agentVersion ?? "",
  temperature: brain?.chat?.temperature === undefined ? "" : String(brain.chat.temperature),
  origin: brain?.chat?.origin ?? "",
  historyUrl: brain?.chat?.historyUrl ?? "",
});

/** The token as the user may paste it: with or without "Bearer ". */
export const cleanToken = (token: string) => token.trim().replace(/^Bearer\s+/i, "");

/** The brain fields to save (the token goes to the bot's secrets, not here). */
export function chatHttpBrainFields(v: ChatHttpValue): Partial<Brain> {
  const temperature = Number(v.temperature.replace(",", "."));
  const chat = {
    ...(v.agentId.trim() ? { agentId: v.agentId.trim() } : {}),
    ...(v.agentVersion.trim() ? { agentVersion: v.agentVersion.trim() } : {}),
    ...(v.temperature.trim() && Number.isFinite(temperature) ? { temperature } : {}),
    ...(v.origin.trim() ? { origin: v.origin.trim() } : {}),
    ...(v.historyUrl.trim() ? { historyUrl: v.historyUrl.trim() } : {}),
  };
  return {
    ...(v.url.trim() ? { baseUrl: v.url.trim() } : {}),
    apiKeySecret: CHAT_HTTP_TOKEN_SECRET,
    ...(v.model.trim() ? { model: v.model.trim() } : {}),
    ...(Object.keys(chat).length ? { chat } : {}),
  };
}

export function ChatHttpFields({
  value,
  onChange,
  hasToken = false,
  name = "chat",
}: {
  value: ChatHttpValue;
  onChange(value: ChatHttpValue): void;
  /** A token is already saved for this bot. */
  hasToken?: boolean;
  name?: string;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [curl, setCurl] = useState("");
  const [read, setRead] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: keyof ChatHttpValue) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  const expires = value.token.trim() ? tokenExpiry(cleanToken(value.token)) : null;
  const when = (d: Date) => d.toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const fromCurl = () => {
    const parsed = parseCurl(curl);
    if (!parsed.url && !parsed.token) {
      setRead({ ok: false, text: t("chat.curlNothing") });
      return;
    }
    // A GET (the history, the chat list) carries no message: its token is good, its address is not the chat's.
    const sends = parsed.hasBody;
    onChange({
      ...value,
      url: sends ? (parsed.url ?? value.url) : value.url,
      token: parsed.token ?? value.token,
      model: parsed.model ?? value.model,
      agentId: parsed.agentId ?? value.agentId,
      agentVersion: parsed.agentVersion ?? value.agentVersion,
      temperature: parsed.temperature === null ? value.temperature : String(parsed.temperature),
      origin: parsed.headers.origin ?? value.origin,
      historyUrl: parsed.historyUrl ?? value.historyUrl,
    });
    // The command holds the token: it does not stay on screen.
    setCurl("");
    const exp = parsed.token ? tokenExpiry(parsed.token) : null;
    const expiry = exp ? t("chat.curlExpires", { when: when(exp) }) : "";
    if (!sends) setRead({ ok: true, text: `${parsed.historyUrl ? t("chat.curlHistory") : t("chat.curlGet")}${expiry}` });
    else setRead({ ok: true, text: exp ? t("chat.curlReadExpires", { when: when(exp) }) : t("chat.curlRead") });
  };

  return (
    <div className="chat-http-fields" data-testid="chat-http-fields">
      <p className="muted settings-help">{t("chat.help")}</p>
      <label className="wide">
        {t("chat.curl")}
        <textarea
          value={curl}
          onChange={(e) => setCurl(e.target.value)}
          rows={3}
          name={`${name}-curl`}
          placeholder="curl --url 'https://…' -H 'authorization: Bearer …' --data-raw …"
          spellCheck={false}
        />
      </label>
      <div className="chat-http-read">
        <button type="button" className="btn" disabled={!curl.trim()} onClick={fromCurl}>
          {t("chat.curlFill")}
        </button>
        {read && (
          <span className={read.ok ? "muted" : "error"} role="status">
            {read.text}
          </span>
        )}
      </div>
      <label>
        {t("chat.url")}
        <input type="url" value={value.url} onChange={set("url")} required placeholder="https://…" name={`${name}-url`} autoComplete="off" />
      </label>
      <label>
        {t("chat.token")}
        <input
          type="password"
          value={value.token}
          onChange={set("token")}
          required={!hasToken}
          placeholder={hasToken ? t("chat.tokenSaved") : "eyJ…"}
          name={`${name}-token`}
          autoComplete="off"
        />
        {expires && (
          <small className={expires.getTime() <= Date.now() ? "error" : "muted"}>
            {expires.getTime() <= Date.now() ? t("chat.tokenExpired", { when: when(expires) }) : t("chat.tokenExpires", { when: when(expires) })}
          </small>
        )}
      </label>
      <label>
        {t("newbot.model")}
        <input value={value.model} onChange={set("model")} placeholder={CHAT_HTTP_DEFAULT_MODEL} name={`${name}-model`} />
      </label>
      <details className="wide">
        <summary>{t("chat.advanced")}</summary>
        <label>
          {t("chat.agentId")}
          <input value={value.agentId} onChange={set("agentId")} placeholder="chat-corporativo" name={`${name}-agent`} />
        </label>
        <label>
          {t("chat.agentVersion")}
          <input value={value.agentVersion} onChange={set("agentVersion")} placeholder="1.0.0" name={`${name}-agent-version`} />
        </label>
        <label>
          {t("chat.temperature")}
          <input value={value.temperature} onChange={set("temperature")} placeholder="0.25" inputMode="decimal" name={`${name}-temperature`} />
        </label>
        <label>
          {t("chat.origin")}
          <input value={value.origin} onChange={set("origin")} placeholder="https://…" name={`${name}-origin`} />
        </label>
        <label>
          {t("chat.historyUrl")}
          <input value={value.historyUrl} onChange={set("historyUrl")} placeholder={t("chat.historyUrlHint")} name={`${name}-history`} />
        </label>
      </details>
    </div>
  );
}
