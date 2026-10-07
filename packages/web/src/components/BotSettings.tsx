// A bot's settings beside its conversation (specs/web-app): identity, description,
// brain, tool policy, computer, allowlists, spend cap; export, duplicate, delete.
import { useEffect, useState } from "react";
import {
  AVATAR_COLORS,
  AVATAR_SHAPES,
  chatApiOrigin,
  tokenExpiry,
  type AvatarShape,
  type Bot,
  type BrainKind,
  type ChatConnectionCheck,
  type ChatTokenStatus,
  type ComputerProviderKind,
  type PolicyDecision,
  type Squad,
  type BotInitiative,
} from "@orbis/shared";
import { ChatHttpFields, chatHttpBrainFields, chatHttpValue, cleanToken } from "./ChatHttpFields.js";
import { ApiKeyFields, keySecretName, type KeyHeader } from "./ApiKeyFields.js";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";
import { BotFace, botLabel } from "./Avatar.js";
import { BRAINS, isLocalKind, ModelField, takesBaseUrl, takesModel, useLocalServers } from "./brains.js";
import { ComputerChoice } from "./ComputerModes.js";
import { ToolPicker } from "./ToolPicker.js";
import { BotInitiativeFields } from "./InitiativeSettings.js";
const DECISIONS: PolicyDecision[] = ["allow", "ask", "deny"];
const list = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

interface Rule {
  tool: string;
  decision: PolicyDecision;
  locked: boolean;
}

export function BotSettings({
  api,
  bot,
  bots = [],
  squads = [],
  onSave,
  onExport,
  onDuplicate,
  onDelete,
  onClose,
}: {
  /** Lets the panel suggest the models of the local servers. */
  api?: Api | null;
  bot: Bot;
  /** The team, for "reports to". */
  bots?: Bot[];
  /** The squads, to put the bot in one (specs/squads). */
  squads?: Squad[];
  onSave(patch: object): Promise<void>;
  onExport(): Promise<void>;
  onDuplicate(): Promise<void>;
  onDelete(): Promise<void>;
  onClose(): void;
}) {
  const t = useT();
  const [name, setName] = useState(bot.name);
  const [role, setRole] = useState(bot.role);
  const [description, setDescription] = useState(bot.description);
  const [color, setColor] = useState(bot.avatar.color);
  const [shape, setShape] = useState<AvatarShape>(bot.avatar.shape ?? "orb");
  const [reportsTo, setReportsTo] = useState(bot.reportsTo ?? "");
  const [squadError, setSquadError] = useState<string | null>(null);
  const [kind, setKind] = useState<BrainKind>(bot.brain.kind);
  const [model, setModel] = useState(bot.brain.model ?? "");
  const [command, setCommand] = useState(bot.brain.command ?? "");
  const [baseUrl, setBaseUrl] = useState(bot.brain.baseUrl ?? "");
  /** The API key being typed: it goes to the bot's vault on save and never comes back. */
  const [apiKey, setApiKey] = useState("");
  const [keyHeader, setKeyHeader] = useState<KeyHeader>(bot.brain.apiKeyHeader ?? "bearer");
  const keyName = keySecretName(bot.brain.apiKeySecret);
  /** Whether the bot's vault holds its key (the names only: values never leave the hub). */
  const [keySaved, setKeySaved] = useState(false);
  const [chat, setChat] = useState(() => chatHttpValue(bot.brain));
  /** Whether a chat-http token is saved for this bot and until when (its value never comes back). */
  const [tokenStatus, setTokenStatus] = useState<ChatTokenStatus | null>(null);
  const hasToken = tokenStatus?.saved === true;
  const [rules, setRules] = useState<Rule[]>(bot.policy.rules.map((r) => ({ tool: r.tool, decision: r.decision, locked: r.locked ?? false })));
  const [grants, setGrants] = useState<string[]>(bot.policy.grants);
  const [computerOn, setComputerOn] = useState(bot.computer.enabled);
  const [provider, setProvider] = useState<ComputerProviderKind | "">(bot.computer.provider ?? "");
  const [hostDir, setHostDir] = useState(bot.computer.hostDir ?? "");
  const [hostConsent, setHostConsent] = useState(false);
  const needsHostConsent = provider === "host" && bot.computer.provider !== "host";
  const [hibernate, setHibernate] = useState(String(bot.computer.hibernateAfterMin ?? ""));
  const [tools, setTools] = useState(bot.tools.join(", "));
  const [skills, setSkills] = useState(bot.skills.join(", "));
  const [cap, setCap] = useState(bot.spendCapUsd === null ? "" : String(bot.spendCapUsd));
  const [capSub, setCapSub] = useState(bot.capIncludesSubscription);
  const [initiative, setInitiative] = useState<BotInitiative>(bot.initiative ?? { enabled: false, frequency: "normal", mcpUpdates: true });
  const [pinned, setPinned] = useState(bot.pinned);
  const [hidden, setHidden] = useState(bot.hidden);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { servers } = useLocalServers(api, isLocalKind(kind));
  const defaultUrl = isLocalKind(kind) ? servers?.find((s) => s.kind === kind)?.baseUrl : undefined;

  // A grant given from an approval card elsewhere shows up here.
  useEffect(() => setGrants(bot.policy.grants), [bot.policy.grants]);
  useEffect(() => {
    if (!api || kind !== "chat-http") return;
    let live = true;
    api
      .get<ChatTokenStatus>(`/api/v1/bots/${bot.id}/chat-token`)
      .then((status) => live && setTokenStatus(status))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, bot.id, kind, bot.brain.apiKeySecret, bot.brain.baseUrl]);

  useEffect(() => {
    if (!api || !takesBaseUrl(kind)) return;
    let live = true;
    api
      .get<Array<{ name: string }>>(`/api/v1/bots/${bot.id}/secrets`)
      .then((names) => live && setKeySaved(names.some((s) => s.name === keyName)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, bot.id, kind, keyName]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ ok: true, text: ok });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      async () => {
        if (needsHostConsent && !hostConsent) throw new Error(t("computers.consentNeeded"));
        // The chat-http token goes to the bot's secrets (encrypted), before the brain that uses it.
        if (kind === "chat-http" && chat.token.trim()) {
          if (!api) throw new Error("no connection to the hub");
          const token = cleanToken(chat.token);
          // The token belongs to the chat API: every bot of that API uses it from now on.
          const origin = chatApiOrigin(chat.url);
          if (!origin) throw new Error(t("chat.tokenNeedsUrl"));
          await api.put("/api/v1/chat-http/tokens", { origin, value: token });
          const expires = tokenExpiry(token);
          setTokenStatus({ saved: true, expiresAt: expires?.toISOString() ?? null, expired: expires !== null && expires.getTime() <= Date.now(), source: "shared" });
          setChat((c) => ({ ...c, token: "" }));
        }
        // An API key goes to the bot's vault (encrypted); the bot keeps only the secret's name.
        const typedKey = takesBaseUrl(kind) ? apiKey.trim() : "";
        if (typedKey) {
          if (!api) throw new Error("no connection to the hub");
          await api.put(`/api/v1/bots/${bot.id}/secrets/${keyName}`, { value: typedKey });
          setKeySaved(true);
          setApiKey("");
        }
        const usesKey = takesBaseUrl(kind) && (typedKey !== "" || keySaved || keyName === bot.brain.apiKeySecret);
        // Settings the form does not show (time limit, step limit) are kept.
        const kept = { ...(bot.brain.timeoutSec ? { timeoutSec: bot.brain.timeoutSec } : {}), ...(bot.brain.maxSteps ? { maxSteps: bot.brain.maxSteps } : {}) };
        await onSave({
          name: name.trim(),
          role: role.trim(),
          description,
          avatarColor: color,
          avatarShape: shape,
          // A squad decides who its bots report to.
          ...(bot.squadId ? {} : { reportsTo: reportsTo || null }),
          brain:
            kind === "chat-http"
              ? { kind, ...kept, ...chatHttpBrainFields(chat) }
              : {
                  kind,
                  ...kept,
                  ...(model.trim() ? { model: model.trim() } : {}),
                  ...(command.trim() ? { command: command.trim() } : {}),
                  ...(baseUrl.trim() && takesBaseUrl(kind) ? { baseUrl: baseUrl.trim() } : {}),
                  ...(usesKey ? { apiKeySecret: keyName } : {}),
                  ...(kind === "openai" && keyHeader === "api-key" ? { apiKeyHeader: keyHeader } : {}),
                },
          policy: { rules: rules.filter((r) => r.tool.trim()).map((r) => ({ tool: r.tool.trim(), decision: r.decision, ...(r.locked ? { locked: true } : {}) })), grants },
          computer: {
            ...bot.computer,
            enabled: computerOn,
            ...(provider ? { provider } : { provider: undefined }),
            hostDir: provider === "host" && hostDir.trim() ? hostDir.trim() : undefined,
            ...(hibernate.trim() ? { hibernateAfterMin: Number(hibernate) } : { hibernateAfterMin: undefined }),
          },
          tools: list(tools),
          skills: list(skills),
          spendCapUsd: cap.trim() === "" ? null : Number(cap),
          capIncludesSubscription: capSub,
          initiative,
          pinned,
          hidden,
        });
      },
      t("settings.saved"),
    );

  return (
    <aside className="computer-panel settings-panel" aria-label={t("settings.title", { name: bot.name })} data-testid="settings-panel">
      <header className="computer-head">
        <h2>{t("settings.title", { name: bot.name })}</h2>
        <button className="btn" onClick={onClose} aria-label={t("computer.close")}>
          ✕
        </button>
      </header>
      <form
        className="routine-form settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset>
          <legend>{t("settings.identity")}</legend>
          <label>
            {t("newbot.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} name="settings-name" />
          </label>
          <label>
            {t("newbot.role")}
            <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} name="settings-role" />
          </label>
          <label>
            {t("newbot.description")}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} name="settings-description" />
          </label>
          {squads.length > 0 && (
            <label>
              {t("settings.squad")}
              <select
                value={bot.squadId ?? ""}
                onChange={(e) => {
                  setSquadError(null);
                  const next = e.target.value;
                  const call = next
                    ? api?.request("PUT", `/api/v1/squads/${next}/members/${bot.id}`)
                    : api?.delete(`/api/v1/squads/${bot.squadId}/members/${bot.id}`);
                  void call?.catch((err: unknown) => setSquadError(err instanceof Error ? err.message : String(err)));
                }}
                name="settings-squad"
              >
                <option value="">{t("sidebar.noSquad")}</option>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {squadError && <span className="error small">{squadError}</span>}
            </label>
          )}
          <label>
            {t("newbot.reportsTo")}
            <select
              value={bot.squadId ? (bot.reportsTo ?? "") : reportsTo}
              onChange={(e) => setReportsTo(e.target.value)}
              name="settings-reports-to"
              disabled={Boolean(bot.squadId)}
            >
              <option value="">{t("newbot.noManager")}</option>
              {bots
                .filter((b) => b.id !== bot.id && !b.hidden)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {botLabel(b)}
                  </option>
                ))}
            </select>
            {bot.squadId && <span className="muted small">{t("settings.reportsBySquad")}</span>}
          </label>
          <div className="face-pickers">
            <BotFace shape={shape} color={color} size={56} />
            <div>
              <div className="swatches small" role="radiogroup" aria-label={t("newbot.color")}>
                {AVATAR_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>
              <div className="shapes small" role="radiogroup" aria-label={t("newbot.shape")}>
                {AVATAR_SHAPES.map((sh) => (
                  <button key={sh} type="button" role="radio" aria-checked={sh === shape} aria-label={t(`shape.${sh}` as TextKey)} className="shape" onClick={() => setShape(sh)}>
                    <BotFace shape={sh} color={color} size={24} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("settings.brain")}</legend>
          <label>
            {t("newbot.brain")}
            <select value={kind} onChange={(e) => setKind(e.target.value as BrainKind)} name="settings-brain">
              {BRAINS.map((k) => (
                <option key={k} value={k}>
                  {t(`brain.${k}` as TextKey)}
                </option>
              ))}
            </select>
          </label>
          {takesModel(kind) && <ModelField kind={kind} value={model} onChange={setModel} name="settings-model" servers={servers} />}
          {kind === "custom-cli" && (
            <label>
              {t("newbot.command")}
              <input value={command} onChange={(e) => setCommand(e.target.value)} name="settings-command" />
            </label>
          )}
          {kind === "chat-http" && <ChatHttpFields value={chat} onChange={setChat} hasToken={hasToken}
              tokenStatus={tokenStatus}
              onCheck={api ? () => api.post<ChatConnectionCheck>(`/api/v1/bots/${bot.id}/chat-check`, {}) : undefined}
              name="settings-chat" />}
          {takesBaseUrl(kind) && (
            <>
              <label>
                {t("newbot.baseUrl")}
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultUrl} name="settings-base-url" />
              </label>
              <ApiKeyFields kind={kind} apiKey={apiKey} onApiKey={setApiKey} header={keyHeader} onHeader={setKeyHeader} saved={keySaved} name="settings" />
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t("settings.policy")}</legend>
          <p className="muted settings-help">{t("settings.policyHelp")}</p>
          {rules.map((rule, i) => (
            <div className="rule-row" key={i} data-testid="policy-rule">
              <input
                aria-label={t("settings.tool")}
                value={rule.tool}
                placeholder="computer.shell"
                onChange={(e) => setRules(rules.map((r, j) => (j === i ? { ...r, tool: e.target.value } : r)))}
              />
              <select
                aria-label={t("settings.decision.ask")}
                value={rule.decision}
                onChange={(e) => setRules(rules.map((r, j) => (j === i ? { ...r, decision: e.target.value as PolicyDecision } : r)))}
              >
                {DECISIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`settings.decision.${d}` as TextKey)}
                  </option>
                ))}
              </select>
              <label className="checkbox">
                <input type="checkbox" checked={rule.locked} onChange={(e) => setRules(rules.map((r, j) => (j === i ? { ...r, locked: e.target.checked } : r)))} />
                {t("settings.locked")}
              </label>
              <button type="button" className="btn" aria-label="✕" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setRules([...rules, { tool: "", decision: "ask", locked: false }])}>
            + {t("settings.addRule")}
          </button>
          {grants.length > 0 && (
            <div className="grants">
              <span className="muted">{t("settings.grants")}:</span>
              {grants.map((g) => (
                <button type="button" key={g} className="chip" onClick={() => setGrants(grants.filter((x) => x !== g))} title="✕">
                  {g} ✕
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>{t("settings.computer")}</legend>
          <label className="checkbox">
            <input type="checkbox" checked={computerOn} onChange={(e) => setComputerOn(e.target.checked)} name="settings-computer" />
            {t("settings.computerEnabled")}
          </label>
          {computerOn && (
            <ComputerChoice
              api={api}
              provider={provider}
              hostDir={hostDir}
              needsConsent={needsHostConsent}
              consent={hostConsent}
              onProvider={setProvider}
              onHostDir={setHostDir}
              onConsent={setHostConsent}
            />
          )}
          <div className="form-row">
            <label>
              {t("settings.hibernate")}
              <input type="number" min={1} value={hibernate} placeholder="30" onChange={(e) => setHibernate(e.target.value)} name="settings-hibernate" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("tools.title")}</legend>
          <ToolPicker api={api} patterns={list(tools)} onChange={(next) => setTools(next.join(", "))} />
          <label>
            {t("settings.tools")}
            <input value={tools} onChange={(e) => setTools(e.target.value)} name="settings-tools" />
          </label>
          <label>
            {t("settings.skills")}
            <input value={skills} onChange={(e) => setSkills(e.target.value)} name="settings-skills" />
          </label>
        </fieldset>

        <BotInitiativeFields api={api} bot={bot} value={initiative} onChange={setInitiative} />

        <fieldset>
          <legend>{t("usage.cap")}</legend>
          <label>
            {t("settings.spendCap")}
            <input type="number" min={0} step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} name="settings-spend-cap" />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={capSub} onChange={(e) => setCapSub(e.target.checked)} name="settings-cap-subscription" />
            {t("settings.capSubscription")}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} name="settings-pinned" />
            {t("settings.pinned")}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} name="settings-hidden" />
            {t("settings.hidden")}
          </label>
        </fieldset>

        {message && (
          <p className={message.ok ? "muted" : "error"} role="status">
            {message.text}
          </p>
        )}
        <div className="card-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {t("settings.save")}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => void run(onExport)}>
            {t("settings.export")}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => void run(onDuplicate)}>
            {t("settings.duplicate")}
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t("settings.confirmDelete", { name: bot.name }))) void run(onDelete);
            }}
          >
            {t("settings.delete")}
          </button>
        </div>
      </form>
    </aside>
  );
}
