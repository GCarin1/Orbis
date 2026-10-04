// The MCP screen (specs/web-app): servers to explore and the servers connected, shaped like the MCP
// marketplaces of Claude, Cursor and VS Code. The catalog shows cards with the service's logo, what it does
// and how it connects; a details sheet says where it runs and whether it only reads before you connect it.
// Each connected server shows its state, the bots that may use it and its tools; a custom server too.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Bot, McpAuthKind, McpCatalogEntry, McpServer } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { Avatar } from "./Avatar.js";
import { McpLogo } from "./McpLogo.js";
import { CheckIcon, MoreIcon, PlusIcon, PuzzleIcon, SearchIcon } from "./Icons.js";
import { Sheet } from "./Sheet.js";

type CatalogItem = McpCatalogEntry & { connected: string | null };
type Tab = "catalog" | "connected";
type T = ReturnType<typeof useT>;
const CATEGORIES = ["all", "research", "dev", "work", "finance", "marketing", "browser", "files", "reasoning"] as const;
type Category = (typeof CATEGORIES)[number];
const AUTHS = ["any", "none", "oauth", "token"] as const;
type AuthFilter = (typeof AUTHS)[number];
/** Where to start: the most asked-for, most with no account to make. */
export const FEATURED = ["deepwiki", "context7", "playwright", "github", "notion", "exa"];

function statusText(t: T, server: McpServer): string {
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

const tone = (server: McpServer) => (server.status === "connected" ? "ok" : server.status === "connecting" ? "wait" : "bad");

/** Where a server runs: a program on this computer, or a service on the web (its address is in the details). */
const where = (t: T, entry: McpCatalogEntry) => t(entry.transport === "stdio" ? "market.where.local" : "market.where.webAny");

/** Connect a catalog entry with the values typed for its fields. */
function useConnect(api: Api, entry: CatalogItem, onConnected: (id: string) => void) {
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
  return { values, setValues, busy, error, connect };
}

/** One catalog card: logo, name, what it does and how it connects. A click opens its details. */
function CatalogCard({
  api,
  entry,
  server,
  onOpen,
  onConnected,
}: {
  api: Api;
  entry: CatalogItem;
  server: McpServer | undefined;
  onOpen(): void;
  onConnected(id: string): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { busy, error, connect } = useConnect(api, entry, onConnected);
  // A server with fields to fill (a key, a folder) connects from its details.
  const quick = entry.fields.length === 0;
  return (
    <article className="mcp-card" data-testid={`catalog-${entry.id}`} onClick={onOpen}>
      <div className="mcp-card-top">
        <McpLogo logo={entry.logo} icon={entry.icon} size={44} />
        <div className="mcp-card-title">
          <button
            type="button"
            className="mcp-card-name"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {entry.name}
          </button>
          <span className="muted small">
            {t(`market.cat.${entry.category}` as TextKey)} · {where(t, entry)}
          </span>
        </div>
        {server ? (
          <span className={`status-pill ${tone(server)}`}>
            {server.status === "connected" && <CheckIcon size={14} />}
            {server.status === "connected" ? t("market.isConnected") : statusText(t, server)}
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (quick) void connect();
              else onOpen();
            }}
          >
            {t("market.connect")}
          </button>
        )}
      </div>
      <p className="mcp-card-desc">{entry.description[lang]}</p>
      <div className="mcp-tags">
        <span className={`mcp-tag auth-${entry.auth}`}>{t(`market.auth.${entry.auth}` as TextKey)}</span>
        {entry.readOnly && <span className="mcp-tag">{t("market.readsOnlyTag")}</span>}
      </div>
      {error && <p className="error small">{error}</p>}
    </article>
  );
}

/** A catalog entry's details: what it does, how it connects, where it runs, what it may change; then connect. */
function CatalogDetails({
  api,
  entry,
  server,
  onClose,
  onConnected,
  onShowConnected,
}: {
  api: Api;
  entry: CatalogItem;
  server: McpServer | undefined;
  onClose(): void;
  onConnected(id: string): void;
  onShowConnected(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { values, setValues, busy, error, connect } = useConnect(api, entry, onConnected);
  const command = entry.transport === "stdio" ? [entry.command, ...(entry.args ?? [])].join(" ") : null;
  return (
    <Sheet title={entry.name} onClose={onClose} testId={`details-${entry.id}`}>
      <div className="mcp-hero">
        <McpLogo logo={entry.logo} icon={entry.icon} size={64} />
        <div>
          <p className="muted small">
            {t(`market.cat.${entry.category}` as TextKey)} · {t(`market.auth.${entry.auth}` as TextKey)}
          </p>
          <a href={entry.homepage} target="_blank" rel="noreferrer">
            {t("market.about")} ↗
          </a>
        </div>
      </div>
      <p>{entry.description[lang]}</p>
      <dl className="mcp-facts">
        <div>
          <dt>{t("market.fact.how")}</dt>
          <dd>{t(`market.how.${entry.auth}` as TextKey)}</dd>
        </div>
        <div>
          <dt>{t("market.fact.where")}</dt>
          <dd>
            {entry.transport === "stdio" ? (
              <>
                {t("market.whereLocal")} <code>{command}</code>
                {entry.needs && <> · {t("market.needs", { what: entry.needs })}</>}
              </>
            ) : (
              <>
                {t("market.whereWeb")} <code>{entry.url}</code>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{t("market.fact.can")}</dt>
          <dd>{entry.readOnly ? t("market.can.read") : t("market.can.write")}</dd>
        </div>
        <div>
          <dt>{t("market.fact.who")}</dt>
          <dd>{t("market.who")}</dd>
        </div>
      </dl>
      {server ? (
        <div className="mcp-callout">
          <span className={`status-pill ${tone(server)}`}>{statusText(t, server)}</span>
          <button type="button" className="btn" onClick={onShowConnected}>
            {t("market.manage")}
          </button>
        </div>
      ) : (
        <form
          className="prefs-form mcp-connect"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          {entry.fields.map((field) => (
            <label key={field.key}>
              {field.label[lang]}
              {field.optional ? ` ${t("market.optional")}` : ""}
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
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {entry.auth === "oauth" ? t("market.connectAccount") : t("market.connect")}
          </button>
          {entry.auth === "oauth" && <p className="muted small">{t("market.signInHelp")}</p>}
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}

/** Up to three faces of the bots that may use a server, and how many more. */
function BotStack({ ids, bots }: { ids: string[]; bots: Bot[] }) {
  const t = useT();
  const given = bots.filter((b) => ids.includes(b.id));
  // No bot yet: the switches below say so.
  if (given.length === 0) return null;
  return (
    <span className="bot-stack" title={given.map((b) => b.name).join(", ")} aria-label={t("market.botsCount", { count: given.length })}>
      {given.slice(0, 3).map((b) => (
        <Avatar key={b.id} bot={b} size={22} />
      ))}
      {given.length > 3 && <span className="bot-stack-more">+{given.length - 3}</span>}
    </span>
  );
}

/** The ⋮ menu of a connected server: reconnect and disconnect. */
function ServerMenu({ server, busy, onReconnect, onDisconnect }: { server: McpServer; busy: boolean; onReconnect(): void; onDisconnect(): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div className="new-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("market.menu", { name: server.name })}
        title={t("market.menu", { name: server.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={busy || server.status === "connecting"}
            onClick={() => {
              setOpen(false);
              onReconnect();
            }}
          >
            <span>↻ {t("market.reconnect")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
          >
            <span>{t("market.disconnect")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** One connected server: its state, sign-in, the bots that may use it and its tools. */
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
  const reconnect = () => void act(() => api.post(`/api/v1/mcp/servers/${server.id}/reconnect`));
  const reads = server.tools.filter((tool) => tool.readOnly).length;
  return (
    <article className={`mcp-server ${tone(server)}`} data-testid={`server-${server.id}`}>
      <header className="mcp-server-head">
        <McpLogo logo={server.logo} icon={server.icon} size={40} />
        <div className="mcp-server-title">
          <strong>{server.name}</strong>
          <span className={`status-line ${tone(server)}`}>
            <i className="dot" aria-hidden="true" /> {statusText(t, server)}
          </span>
        </div>
        <BotStack ids={server.bots} bots={visible} />
        <ServerMenu
          server={server}
          busy={busy}
          onReconnect={reconnect}
          onDisconnect={() => {
            if (window.confirm(t("market.confirmDisconnect", { name: server.name }))) void act(() => api.delete(`/api/v1/mcp/servers/${server.id}`));
          }}
        />
      </header>
      {server.status === "needs_auth" && server.authUrl && (
        <div className="mcp-callout">
          <a className="btn btn-primary" href={server.authUrl} target="_blank" rel="noreferrer">
            {t("market.signIn", { name: server.name })}
          </a>
          <span className="muted small">{t("market.signInHelp")}</span>
        </div>
      )}
      {server.status === "error" && (
        <div className="mcp-callout bad">
          {server.error && <p className="error small">{server.error}</p>}
          <button type="button" className="btn" disabled={busy} onClick={reconnect}>
            ↻ {t("market.reconnect")}
          </button>
        </div>
      )}
      {server.status === "connected" && (
        <>
          <fieldset className="mcp-section">
            <legend>{t("market.whichBots")}</legend>
            {visible.length === 0 && <p className="muted small">{t("brains.noBots")}</p>}
            <div className="bot-toggles">
              {visible.map((bot) => {
                const on = ticked[bot.id] ?? server.bots.includes(bot.id);
                return (
                  <label key={bot.id} className={`bot-toggle${on ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
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
                    <Avatar bot={bot} size={20} /> {bot.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mcp-section">
            <button type="button" className="mcp-tools-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              <span>{open ? t("market.hideTools") : t("market.showTools", { count: server.tools.length })}</span>
              <span className="muted small">{t("market.toolsSplit", { reads, asks: server.tools.length - reads })}</span>
            </button>
            {open && (
              <ul className="mcp-tools">
                {server.tools.map((tool) => (
                  <li key={tool.name}>
                    <div className="mcp-tool-name">
                      <code>{tool.remoteName}</code>
                      {tool.readOnly ? <span className="mcp-tag read">{t("market.readOnly")}</span> : <span className="mcp-tag asks">{t("market.asks")}</span>}
                    </div>
                    {tool.description && <div className="muted small">{tool.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
      onConnected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <form
      className="prefs-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="muted small">{t("market.customHelp")}</p>
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
      <button className="btn btn-primary" type="submit" disabled={!name.trim() || (kind === "http" ? !url.trim() : !command.trim())}>
        {t("market.connect")}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** Does an entry match the search: its name, what it does (in the interface language) or its category. */
function matches(entry: CatalogItem, q: string, lang: "en" | "pt-BR"): boolean {
  if (!q) return true;
  const text = `${entry.name} ${entry.description[lang]} ${entry.description.en} ${entry.id}`.toLowerCase();
  return q.split(/\s+/).every((word) => text.includes(word));
}

export function Marketplace({ api, bots, servers, onLoad }: { api: Api; bots: Bot[]; servers: Record<string, McpServer>; onLoad(): Promise<void> }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [tab, setTab] = useState<Tab>("catalog");
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [auth, setAuth] = useState<AuthFilter>("any");
  const [details, setDetails] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
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
  const all = catalog ?? [];
  const searched = all.filter((e) => matches(e, q, lang) && (auth === "any" || e.auth === (auth as McpAuthKind)));
  const shown = searched.filter((e) => category === "all" || e.category === category);
  const count = (c: Category) => (c === "all" ? searched.length : searched.filter((e) => e.category === c).length);
  const filtering = q !== "" || category !== "all" || auth !== "any";
  const featured = FEATURED.map((id) => all.find((e) => e.id === id)).filter((e): e is CatalogItem => e !== undefined);
  const open = details ? all.find((e) => e.id === details) : undefined;
  const connected = () => {
    setDetails(null);
    setCustom(false);
    setTab("connected");
  };
  const tools = list.reduce((n, s) => n + s.tools.length, 0);
  return (
    <section className="screen market-screen" aria-labelledby="market-title" data-testid="marketplace">
      <header className="screen-head mcp-head">
        <div className="mcp-head-row">
          <div>
            <h1 id="market-title">{t("market.title")}</h1>
            <p className="muted">{t("market.help")}</p>
          </div>
          {/* On a phone only the + shows: the label keeps its name. */}
          <button type="button" className="btn mcp-add" aria-label={t("market.custom")} title={t("market.custom")} onClick={() => setCustom(true)}>
            <PlusIcon size={16} /> <span>{t("market.custom")}</span>
          </button>
        </div>
        <div className="mcp-tabs" role="tablist" aria-label={t("market.title")}>
          <button type="button" role="tab" aria-selected={tab === "catalog"} onClick={() => setTab("catalog")}>
            {t("market.catalog")}
            <span className="mcp-count">{all.length || ""}</span>
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
            <div className="mcp-toolbar">
              <label className="mcp-search">
                <SearchIcon size={18} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("market.search")}
                  aria-label={t("market.search")}
                />
              </label>
              <div className="segmented mcp-auth" role="group" aria-label={t("market.howConnects")}>
                {AUTHS.map((a) => (
                  <button key={a} type="button" aria-pressed={auth === a} className={auth === a ? "on" : ""} onClick={() => setAuth(a)}>
                    {t(a === "any" ? "market.authAny" : (`market.authShort.${a}` as TextKey))}
                  </button>
                ))}
              </div>
            </div>
            <div className="mcp-cats" role="group" aria-label={t("market.categories")}>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`chip${category === c ? " on" : ""}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {t(`market.cat.${c}` as TextKey)}
                  <span className="chip-count" aria-hidden="true">
                    {count(c)}
                  </span>
                </button>
              ))}
            </div>
            {catalog === null && <p className="muted">…</p>}
            {!filtering && featured.length > 0 && (
              <section className="mcp-featured" aria-labelledby="mcp-featured">
                <h2 id="mcp-featured">{t("market.featured")}</h2>
                <div className="mcp-featured-row">
                  {featured.map((entry) => (
                    <button key={entry.id} type="button" className="mcp-feature" data-testid={`featured-${entry.id}`} onClick={() => setDetails(entry.id)}>
                      <McpLogo logo={entry.logo} icon={entry.icon} size={36} />
                      <span className="mcp-feature-text">
                        <strong>{entry.name}</strong>
                        <span className="muted small">{t(`market.auth.${entry.auth}` as TextKey)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {catalog !== null && (
              <h2 className="mcp-list-title">{filtering ? t("market.results", { count: shown.length }) : t("market.allServers", { count: all.length })}</h2>
            )}
            {catalog !== null && shown.length === 0 && (
              <div className="mcp-empty">
                <p>{t("market.noMatch")}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setAuth("any");
                  }}
                >
                  {t("market.clearFilters")}
                </button>
              </div>
            )}
            <div className="mcp-grid">
              {shown.map((entry) => (
                <CatalogCard
                  key={entry.id}
                  api={api}
                  entry={entry}
                  server={byCatalog.get(entry.id)}
                  onOpen={() => setDetails(entry.id)}
                  onConnected={connected}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {list.length > 0 && (
              <p className="muted mcp-summary">{t("market.summary", { servers: list.length, tools, bots: new Set(list.flatMap((s) => s.bots)).size })}</p>
            )}
            {list.length === 0 && (
              <div className="mcp-empty big">
                <PuzzleIcon size={36} />
                <h2>{t("market.emptyTitle")}</h2>
                <p className="muted">{t("market.none")}</p>
                <button type="button" className="btn btn-primary" onClick={() => setTab("catalog")}>
                  {t("market.explore")}
                </button>
              </div>
            )}
            <div className="server-list">
              {list.map((server) => (
                <ServerCard key={server.id} api={api} server={server} bots={bots} />
              ))}
            </div>
          </>
        )}
      </div>
      {open && (
        <CatalogDetails
          api={api}
          entry={open}
          server={byCatalog.get(open.id)}
          onClose={() => setDetails(null)}
          onConnected={connected}
          onShowConnected={connected}
        />
      )}
      {custom && (
        <Sheet title={t("market.custom")} onClose={() => setCustom(false)} testId="custom-server">
          <CustomServer api={api} onConnected={connected} />
        </Sheet>
      )}
    </section>
  );
}
