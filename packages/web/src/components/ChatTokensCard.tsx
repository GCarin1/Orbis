// The chat APIs' tokens, in one place (specs/web-app): every chat-http bot of one chat API shares that
// API's Bearer token, so a token that expired is changed here once — pasted as it is, or as the cURL of
// a browser request — for all of them. The token is sent to the hub's vault and never shown back.
import { useCallback, useEffect, useState } from "react";
import { chatApiOrigin, cleanBearer, parseCurl, type ChatTokenGroup } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";

/** What the hub answered, kept only when it is a list of chat APIs (an older hub answers something else, or nothing). */
const validGroups = (list: unknown): ChatTokenGroup[] =>
  Array.isArray(list)
    ? list.filter((g): g is ChatTokenGroup => !!g && typeof g.origin === "string" && typeof g.token === "object" && Array.isArray(g.bots))
    : [];

export function ChatTokensCard({ api }: { api: Api }) {
  const t = useT();
  const [groups, setGroups] = useState<ChatTokenGroup[] | null>(null);
  const load = useCallback(() => {
    api
      .get<ChatTokenGroup[]>("/api/v1/chat-http/tokens")
      .then((list) => setGroups(validGroups(list)))
      .catch(() => setGroups([]));
  }, [api]);
  useEffect(() => load(), [load]);
  if (!groups?.length) return null;
  return (
    <article className="brain-card chat-tokens-card" data-testid="chat-tokens">
      <header>
        <strong>
          <span aria-hidden="true">🔑</span> {t("chatTokens.title")}
        </strong>
      </header>
      <p className="small">{t("chatTokens.help")}</p>
      {groups.map((group) => (
        <TokenRow key={group.origin} api={api} group={group} onSaved={(next) => setGroups(validGroups(next))} />
      ))}
    </article>
  );
}

function TokenRow({ api, group, onSaved }: { api: Api; group: ChatTokenGroup; onSaved(groups: ChatTokenGroup[]): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const status = group.token;

  const save = async () => {
    let value = text.trim();
    // A pasted cURL gives its token, if it is a request to this API.
    if (/^curl\s/i.test(value)) {
      const parsed = parseCurl(value);
      const from = chatApiOrigin(parsed.url ?? "");
      if (from && from !== group.origin) return setMessage({ ok: false, text: t("chatTokens.otherApi", { origin: from }) });
      value = parsed.token ?? "";
    } else value = cleanBearer(value);
    if (!value) return setMessage({ ok: false, text: t("chatTokens.noToken") });
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.put<ChatTokenGroup[]>("/api/v1/chat-http/tokens", { origin: group.origin, value });
      onSaved(next);
      setText("");
      const saved = next.find((g) => g.origin === group.origin)?.token;
      const expiry = saved?.expiresAt ? t("chatTokens.expiry", { when: when(saved.expiresAt) }) : "";
      setMessage({ ok: true, text: t("chatTokens.saved", { count: group.bots.length, expiry }) });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-token-row" data-testid={`chat-token-${group.origin}`}>
      <p className="small">
        <code>{group.origin}</code> —{" "}
        {!status.saved ? (
          <span className="error">{t("chatTokens.none")}</span>
        ) : status.expired && status.expiresAt ? (
          <span className="error">{t("chat.tokenStatusExpired", { when: when(status.expiresAt) })}</span>
        ) : status.expiresAt ? (
          <span className="muted">{t("chat.tokenStatusShared", { when: when(status.expiresAt) })}</span>
        ) : (
          <span className="muted">{t("chat.tokenStatusSharedNoExp")}</span>
        )}
      </p>
      <p className="muted small">{t("chatTokens.usedBy", { names: group.bots.map((b) => b.name).join(", ") })}</p>
      <label className="wide">
        {t("chatTokens.paste", { origin: group.origin })}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          spellCheck={false}
          autoComplete="off"
          placeholder="eyJ… / curl --url 'https://…' -H 'authorization: Bearer …'"
        />
      </label>
      <div className="card-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void save()}>
          {t("chatTokens.save", { count: group.bots.length })}
        </button>
        {message && (
          <span className={message.ok ? "muted small" : "error small"} role="status">
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}
