// The settings screen (specs/web-app), in tabs: the brains this machine has
// with a test that proves a model answers and which brain each bot uses; voice
// and appearance.
import { useEffect, useState } from "react";
import type { Bot, BrainTestResult, RuntimeHealth } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";
import { Avatar } from "./Avatar.js";
import { brainLabel, brainShort, claudeLoginExpired, TestResultView, useLocalServers, type TestState } from "./brains.js";
import { ClaudeSignIn } from "./ClaudeSignIn.js";
import { ChatGptCard } from "./ChatGptCard.js";
import { ChatTokensCard } from "./ChatTokensCard.js";
import { ComputersSettings } from "./ComputerModes.js";
import { VoiceSettings } from "./VoiceSettings.js";
import { PhoneSettings } from "./PhoneSettings.js";
import { InitiativeSettingsTab } from "./InitiativeSettings.js";
import { HealthSettings } from "./HealthSettings.js";
import { AccountSettings } from "./AccountSettings.js";
import { DataSettings } from "./DataSettings.js";
import { DeviceSettings } from "./DeviceSettings.js";
import { useStore } from "../store.js";
import type { AccountSession } from "../account.js";

export type SettingsTab = "brains" | "conversations" | "computers" | "initiative" | "health" | "voice" | "phone" | "account" | "data";
/** The tabs in four groups (change 0092): the bots, how conversations go, the account and its devices, the data. */
const GROUPS: Array<{ label: TextKey; tabs: SettingsTab[] }> = [
  { label: "settings.group.bots", tabs: ["brains", "computers", "initiative"] },
  { label: "settings.group.conversations", tabs: ["conversations", "voice"] },
  { label: "settings.group.account", tabs: ["account", "phone", "health"] },
  { label: "settings.group.data", tabs: ["data"] },
];

/** What an import added shows at once: the lists are read again. */
function reloadAll(): void {
  const s = useStore.getState();
  void s.loadBots().catch(() => undefined);
  void s.loadConversations().catch(() => undefined);
  void s.loadSquads().catch(() => undefined);
  void s.loadMcpServers().catch(() => undefined);
}

export function SettingsScreen({
  api,
  bots,
  onConfigureBot,
  initialTab = "brains",
  account = null,
  onSignedOut = () => undefined,
}: {
  api: Api;
  bots: Bot[];
  onConfigureBot(botId: string): void;
  initialTab?: SettingsTab;
  /** The Orbis account this device signed in with (null: the hub's token). */
  account?: AccountSession | null;
  onSignedOut?(): void;
}) {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  return (
    <section className="screen brains-screen" aria-labelledby="brains-title" data-testid="settings-screen">
      <header className="screen-head">
        <h1 id="brains-title">{t("brains.title")}</h1>
      </header>
      <div className="settings-layout">
        <div className="settings-tabs settings-nav" role="tablist" aria-label={t("brains.title")}>
          {GROUPS.map((group) => (
            <div key={group.label} className="tab-group" role="presentation">
              <span className="tab-group-label" aria-hidden="true">
                {t(group.label)}
              </span>
              {group.tabs.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`settings-panel-${id}`}
                  onClick={() => setTab(id)}
                >
                  {t(`settings.tab.${id}` as TextKey)}
                </button>
              ))}
            </div>
          ))}
        </div>
      <div className="screen-body" role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {tab === "brains" && <BrainsTab api={api} bots={bots} onConfigureBot={onConfigureBot} />}
        {tab === "conversations" && <ConversationDefaultsSettings />}
        {tab === "computers" && <ComputersSettings api={api} />}
        {tab === "initiative" && <InitiativeSettingsTab api={api} />}
        {tab === "health" && <HealthSettings api={api} bots={bots} />}
        {tab === "voice" && <VoiceSettings api={api} />}
        {tab === "phone" && <PhoneSettings api={api} />}
        {tab === "account" && (
          <>
            <AccountSettings api={api} account={account} onSignedOut={onSignedOut} />
            <DeviceSettings api={api} account={account} />
          </>
        )}
        {tab === "data" && <DataSettings api={api} account={account} onImported={reloadAll} />}
      </div>
      </div>
    </section>
  );
}

function BrainsTab({ api, bots, onConfigureBot }: { api: Api; bots: Bot[]; onConfigureBot(botId: string): void }) {
  const t = useT();
  const [health, setHealth] = useState<RuntimeHealth[] | null>(null);
  const [round, setRound] = useState(0);
  const { servers, reload } = useLocalServers(api);
  const [models, setModels] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, TestState>>({});

  useEffect(() => {
    let live = true;
    api
      .get<RuntimeHealth[]>("/api/v1/runtimes/health")
      .then((h) => live && setHealth(h))
      .catch(() => live && setHealth([]));
    return () => {
      live = false;
    };
  }, [api, round]);

  const runTest = async (key: string, body: object) => {
    setTests((all) => ({ ...all, [key]: { pending: true } }));
    let result: BrainTestResult;
    try {
      result = await api.post<BrainTestResult>("/api/v1/runtimes/test", body);
    } catch (err) {
      result = { kind: "mock", ok: false, reply: "", error: err instanceof Error ? err.message : String(err), durationMs: 0, answered: false };
    }
    setTests((all) => ({ ...all, [key]: { pending: false, result } }));
  };
  const busy = (key: string) => tests[key]?.pending === true;
  const visible = bots.filter((b) => !b.hidden);
  const subscriptionCard = (h: RuntimeHealth) => (
          <article key={h.kind} className="brain-card" data-testid={`brain-${h.kind}`}>
            <header>
              <strong>{brainShort(t, h.kind)}</strong>
              <span className={`badge ${h.found ? "ok" : "off"}`}>{h.found ? `✓ ${t("brains.found")}` : `✗ ${t("brains.missing")}`}</span>
            </header>
            {h.found ? (
              <details className="brain-details muted small">
                <summary>{t("brains.details")}</summary>
                {h.version ?? "?"} · <code>{h.path}</code>
              </details>
            ) : (
              <p className="muted small">{t(`brains.install.${h.kind}` as TextKey)}</p>
            )}
            {h.kind === "claude-code" && h.found && (
              <ClaudeSignIn api={api} expired={claudeLoginExpired(tests[h.kind])} onSignedIn={() => setTests(({ [h.kind]: _old, ...rest }) => rest)} />
            )}
            <button className="btn" disabled={!h.found || busy(h.kind)} onClick={() => void runTest(h.kind, { brain: { kind: h.kind } })}>
              {t("brains.test")}
            </button>
            <TestResultView state={tests[h.kind]} />
          </article>
        
  );
  const localCard = (s: NonNullable<typeof servers>[number]) => {
          const model = models[s.kind] ?? s.models[0] ?? "";
          return (
            <article key={s.kind} className="brain-card" data-testid={`brain-${s.kind}`}>
              <header>
                <strong>{brainShort(t, s.kind)}</strong>
                <span className={`badge ${s.reachable ? "ok" : "off"}`}>
                  {s.reachable ? `✓ ${t("brains.running", { count: s.models.length })}` : `✗ ${t("brains.stopped")}`}
                </span>
              </header>
              {s.reachable ? (
                <p className="muted small">
                  <code>{s.baseUrl}</code>
                </p>
              ) : (
                <p className="muted small">
                  {t("brains.notRunning", { url: s.baseUrl })} {t(`brains.install.${s.kind}` as TextKey)}
                </p>
              )}
              {s.models.length > 0 && (
                <label>
                  {t("brains.model")}
                  <select value={model} onChange={(e) => setModels((all) => ({ ...all, [s.kind]: e.target.value }))} name={`${s.kind}-model`}>
                    {s.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="btn"
                disabled={!s.reachable || !model || busy(s.kind)}
                onClick={() => void runTest(s.kind, { brain: { kind: s.kind, model } })}
              >
                {t("brains.test")}
              </button>
              <TestResultView state={tests[s.kind]} />
            </article>
          );
        
  };

  return (
    <>
      <div className="settings-intro">
        <p className="muted">{t("brains.help")}</p>
        <div className="card-actions">
          <button
            className="btn"
            onClick={() => {
              setRound((r) => r + 1);
              reload();
            }}
          >
            ↻ {t("brains.refresh")}
          </button>
        </div>
      </div>
      {/* What the bots use first, the brains ready next, the rest under "Add a brain" (change 0092). */}
      <h2>{t("brains.bots")}</h2>
      {visible.length === 0 ? (
        <p className="muted">{t("brains.noBots")}</p>
      ) : (
        <div className="table-scroll">
          <table className="usage-table brains-table">
            <thead>
              <tr>
                <th scope="col">{t("brains.bot")}</th>
                <th scope="col">{t("brains.brain")}</th>
                <th scope="col">{t("brains.model")}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {visible.map((bot) => {
                const key = `bot:${bot.id}`;
                return (
                  <tr key={bot.id} data-testid={`brain-bot-${bot.handle}`}>
                    <td>
                      <span className="usage-bot">
                        <Avatar bot={bot} size={24} /> {bot.name} <span className="muted">@{bot.handle}</span>
                      </span>
                    </td>
                    <td title={brainLabel(t, bot.brain.kind)}>{brainShort(t, bot.brain.kind)}</td>
                    <td>{bot.brain.model ?? <span className="muted">{t("brains.defaultModel")}</span>}</td>
                    <td>
                      <div className="card-actions">
                        <button className="btn" disabled={busy(key)} onClick={() => void runTest(key, { botId: bot.id })}>
                          {t("brains.test")}
                        </button>
                        <button className="btn" onClick={() => onConfigureBot(bot.id)}>
                          ⚙ {t("brains.configure")}
                        </button>
                      </div>
                      <TestResultView state={tests[key]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("brains.ready")}</h2>
      <p className="muted settings-help">{t("brains.testHelp")}</p>
      <div className="brain-grid">
        {(health === null || servers === null) && <p className="muted">…</p>}
        {health?.filter((h) => h.found).map((h) => subscriptionCard(h))}
        {servers?.filter((s) => s.reachable).map((s) => localCard(s))}
      </div>

      <details className="add-brain" data-testid="add-brain">
        <summary>
          {t("brains.add", { count: (health?.filter((h) => !h.found).length ?? 0) + (servers?.filter((s) => !s.reachable).length ?? 0) + 2 })}
        </summary>
        <ChatGptCard api={api} />
        <ChatTokensCard api={api} />
        <div className="brain-grid">
          {health?.filter((h) => !h.found).map((h) => subscriptionCard(h))}
          {servers?.filter((s) => !s.reachable).map((s) => localCard(s))}
        </div>
      </details>
    </>
  );
}

/** How new conversations talk, and those with no choice of their own (change 0082). */
function ConversationDefaultsSettings() {
  const t = useT();
  const defaults = useStore((s) => s.conversationDefaults);
  const save = useStore((s) => s.setConversationDefaults);
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<typeof defaults>) => void save(patch).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  return (
    <section className="settings-section" data-testid="conversation-defaults">
      <p className="muted">{t("style.help")}</p>
      <fieldset className="radio-group">
        <legend>{t("style.replies")}</legend>
        <label>
          <input type="radio" name="reply-style" checked={defaults.replyStyle === "chat"} onChange={() => change({ replyStyle: "chat" })} /> {t("style.chat")}
          <span className="muted small"> — {t("style.chatHelp")}</span>
        </label>
        <label>
          <input type="radio" name="reply-style" checked={defaults.replyStyle === "detailed"} onChange={() => change({ replyStyle: "detailed" })} /> {t("style.detailed")}
          <span className="muted small"> — {t("style.detailedHelp")}</span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={defaults.backstage} onChange={(e) => change({ backstage: e.target.checked })} /> {t("style.backstage")}
        <span className="muted small"> — {t("style.backstageHelp")}</span>
      </label>
      <p className="muted small">{t("style.perConversation")}</p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
