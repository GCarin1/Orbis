// The tools marketplace (specs/web-app): MCP servers to connect in one click —
// no account, signing in with your account, or pasting a key — the servers
// connected, their tools, and which bots may use them; a custom server too.
import { useEffect, useMemo, useState } from "react";
import type { Bot, McpCatalogEntry, McpServer } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { Avatar } from "./Avatar.js";

type CatalogItem = McpCatalogEntry & { connected: string | null };
type Tab = "catalog" | "connected";
const CATEGORIES = ["all", "research", "dev", "work", "browser", "files", "reasoning"] as const;

function statusText(t: ReturnType<typeof useT>, server: McpServer): string {
  switch (server.status) {
    case "connected":
      return t("market.status.connected", { count: server.tools.length });
    case "needs_auth":
      return t("market.status.needsAuth");
    case "error":
      return t("market.status.error");
    default:
      return t("market.status.connecting");
  }
}

/** One connected server: its state, sign-in, tools and the bots that may use it. */
export function ServerCard({ api, server, bots }: { api: Api; server: McpServer; bots: Bot[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const visible = bots.filter((b) => !b.hidden);
  // A tick shows at once; the server's next update confirms it.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const confirmed = server.bots.join(",");
  useEffect(() => setTicked({}), [confirmed]);
  return (
    <article className="brain-card server-card" data-testid={`server-${server.id}`}>
      <header>
        <strong>
          <span aria-hidden="true">{server.icon}</span> {server.name}
        </strong>
        <span className={`badge ${server.status === "connected" ? "ok" : server.status === "connecting" ? "" : "off"}`}>{statusText(t, server)}</span>
      </header>
      {server.status === "needs_auth" && server.authUrl && (
        <p>
          <a className="btn btn-primary" href={server.authUrl} target="_blank" rel="noreferrer">
            {t("market.signIn", { name: server.name })}
          </a>{" "}
          <span className="muted small">{t("market.signInHelp")}</span>
        </p>
      )}
      {server.status === "error" && server.error && <p className="error small">{server.error}</p>}
      {server.status === "connected" && (
        <>
          <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t("market.hideTools") : t("market.showTools", { count: server.tools.length })}
          </button>
          {open && (
            <ul className="server-tools">
              {server.tools.map((tool) => (
                <li key={tool.name}>
                  <code>{tool.remoteName}</code>{" "}
                  {tool.readOnly ? <span className="badge ok">{t("market.readOnly")}</span> : <span className="badge">{t("market.asks")}</span>}
                  <div className="muted small">{tool.description}</div>
                </li>
              ))}
            </ul>
          )}
          <fieldset className="server-bots">
            <legend>{t("market.whichBots")}</legend>
            {visible.length === 0 && <p className="muted small">{t("brains.noBots")}</p>}
            {visible.map((bot) => (
              <label key={bot.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={ticked[bot.id] ?? server.bots.includes(bot.id)}
                  disabled={busy}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setTicked((all) => ({ ...all, [bot.id]: enabled }));
                    void act(async () => {
                      try {
                        await api.post(`/api/v1/mcp/servers/${server.id}/bots`, { botId: bot.id, enabled });
                      } catch (err) {
                        setTicked(({ [bot.id]: _undone, ...rest }) => rest);
                        throw err;
                      }
                    });
                  }}
                />
                <Avatar bot={bot} size={18} /> {bot.name}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="card-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || server.status === "connecting"}
          onClick={() => void act(() => api.post(`/api/v1/mcp/servers/${server.id}/reconnect`))}
        >
          ↻ {t("market.reconnect")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("market.confirmDisconnect", { name: server.name }))) void act(() => api.delete(`/api/v1/mcp/servers/${server.id}`));
          }}
        >
          {t("market.disconnect")}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </article>
  );
}

function CatalogCard({ api, entry, server, onConnected }: { api: Api; entry: CatalogItem; server: McpServer | undefined; onConnected(id: string): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<McpServer>("/api/v1/mcp/servers", { catalogId: entry.id, values });
      onConnected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const needsForm = entry.fields.length > 0;
  return (
    <article className="brain-card market-card" data-testid={`catalog-${entry.id}`}>
      <header>
        <strong>
          <span className="market-icon" aria-hidden="true">
            {entry.icon}
          </span>{" "}
          {entry.name}
        </strong>
        <span className={`badge auth-${entry.auth}`}>{t(`market.auth.${entry.auth}` as TextKey)}</span>
      </header>
      <p className="small">{entry.description[lang]}</p>
      <p className="muted small">
        {entry.needs ? `${t("market.needs", { what: entry.needs })} · ` : ""}
        <a href={entry.homepage} target="_blank" rel="noreferrer">
          {t("market.about")}
        </a>
      </p>
      {server ? (
        <p>
          <span className={`badge ${server.status === "connected" ? "ok" : "off"}`}>{statusText(t, server)}</span>
        </p>
      ) : open ? (
        <form
          className="prefs-form"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          {entry.fields.map((field) => (
            <label key={field.key}>
              {field.label[lang]}
              <input
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                value={values[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) => setValues((all) => ({ ...all, [field.key]: e.target.value }))}
                name={`field-${field.key}`}
              />
              {(field.help || field.link) && (
                <span className="muted small">
                  {field.help?.[lang]}{" "}
                  {field.link && (
                    <a href={field.link} target="_blank" rel="noreferrer">
                      {t("market.getKey")}
                    </a>
                  )}
                </span>
              )}
            </label>
          ))}
          <div className="card-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {t("market.connect")}
            </button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              {t("newbot.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => (needsForm ? setOpen(true) : void connect())}>
          {entry.auth === "oauth" ? t("market.connectAccount") : t("market.connect")}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}

/** A server that is not in the catalog: a program to start, or an address. */
function CustomServer({ api, onConnected }: { api: Api; onConnected(id: string): void }) {
  const t = useT();
  const [kind, setKind] = useState<"stdio" | "http">("http");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [env, setEnv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const body =
        kind === "http"
          ? { name, transport: "http", url, ...(token ? { token } : {}) }
          : (() => {
              const [cmd, ...args] = command.trim().split(/\s+/);
              const vars = Object.fromEntries(
                env
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.includes("="))
                  .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
              );
              return { name, transport: "stdio", command: cmd, args, env: vars };
            })();
      const created = await api.post<McpServer>("/api/v1/mcp/servers", body);
      setName("");
      setCommand("");
      setUrl("");
      setToken("");
      setEnv("");
      onConnected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <details className="custom-server">
      <summary>{t("market.custom")}</summary>
      <form
        className="prefs-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          {t("market.customName")}
          <input value={name} onChange={(e) => setName(e.target.value)} name="custom-name" />
        </label>
        <div className="segmented" role="radiogroup" aria-label={t("market.customKind")}>
          {(["http", "stdio"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
              {t(`market.kind.${k}` as TextKey)}
            </button>
          ))}
        </div>
        {kind === "http" ? (
          <>
            <label>
              {t("market.customUrl")}
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" name="custom-url" />
            </label>
            <label>
              {t("market.customToken")}
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} name="custom-token" />
            </label>
          </>
        ) : (
          <>
            <label>
              {t("market.customCommand")}
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-memory"
                name="custom-command"
              />
            </label>
            <label>
              {t("market.customEnv")}
              <textarea value={env} onChange={(e) => setEnv(e.target.value)} placeholder="API_KEY=…" rows={2} name="custom-env" />
            </label>
          </>
        )}
        <div className="card-actions">
          <button className="btn btn-primary" type="submit" disabled={!name.trim() || (kind === "http" ? !url.trim() : !command.trim())}>
            {t("market.connect")}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </details>
  );
}

export function Marketplace({ api, bots, servers, onLoad }: { api: Api; bots: Bot[]; servers: Record<string, McpServer>; onLoad(): Promise<void> }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [tab, setTab] = useState<Tab>("catalog");
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void onLoad().catch(() => undefined);
    api
      .get<CatalogItem[]>("/api/v1/mcp/catalog")
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const byCatalog = useMemo(() => new Map(Object.values(servers).map((s) => [s.catalogId, s])), [servers]);
  const list = Object.values(servers);
  const q = query.trim().toLowerCase();
  const shown = (catalog ?? []).filter(
    (e) => (category === "all" || e.category === category) && (!q || e.name.toLowerCase().includes(q) || e.description[lang].toLowerCase().includes(q)),
  );
  return (
    <section className="screen market-screen" aria-labelledby="market-title" data-testid="marketplace">
      <header className="screen-head">
        <h1 id="market-title">{t("market.title")}</h1>
        <p className="muted">{t("market.help")}</p>
        <div className="settings-tabs" role="tablist" aria-label={t("market.title")}>
          <button type="button" role="tab" aria-selected={tab === "catalog"} onClick={() => setTab("catalog")}>
            {t("market.catalog")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "connected"} onClick={() => setTab("connected")}>
            {t("market.connected", { count: list.length })}
          </button>
        </div>
      </header>
      <div className="screen-body" role="tabpanel">
        {error && <p className="error">{error}</p>}
        {tab === "catalog" ? (
          <>
            <div className="market-filters">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("market.search")} aria-label={t("market.search")} />
              <div className="chips">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" className={`chip${category === c ? " on" : ""}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
                    {t(`market.cat.${c}` as TextKey)}
                  </button>
                ))}
              </div>
            </div>
            {catalog === null && <p className="muted">…</p>}
            <div className="brain-grid market-grid">
              {shown.map((entry) => (
                <CatalogCard key={entry.id} api={api} entry={entry} server={byCatalog.get(entry.id)} onConnected={() => setTab("connected")} />
              ))}
            </div>
          </>
        ) : (
          <>
            {list.length === 0 && <p className="muted">{t("market.none")}</p>}
            <div className="server-list">
              {list.map((server) => (
                <ServerCard key={server.id} api={api} server={server} bots={bots} />
              ))}
            </div>
            <CustomServer api={api} onConnected={() => setTab("connected")} />
          </>
        )}
      </div>
    </section>
  );
}
