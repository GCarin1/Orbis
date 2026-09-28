// A bot's settings beside its conversation (specs/web-app): identity, description,
// brain, tool policy, computer, allowlists, spend cap; export, duplicate, delete.
import { useEffect, useState } from "react";
import { AVATAR_COLORS, AVATAR_SHAPES, type AvatarShape, type Bot, type BrainKind, type PolicyDecision } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";
import { BotFace } from "./Avatar.js";
import { BRAINS, isLocalKind, ModelField, takesBaseUrl, takesModel, useLocalServers } from "./brains.js";
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
  const [kind, setKind] = useState<BrainKind>(bot.brain.kind);
  const [model, setModel] = useState(bot.brain.model ?? "");
  const [command, setCommand] = useState(bot.brain.command ?? "");
  const [baseUrl, setBaseUrl] = useState(bot.brain.baseUrl ?? "");
  const [apiKeySecret, setApiKeySecret] = useState(bot.brain.apiKeySecret ?? "");
  const [rules, setRules] = useState<Rule[]>(bot.policy.rules.map((r) => ({ tool: r.tool, decision: r.decision, locked: r.locked ?? false })));
  const [grants, setGrants] = useState<string[]>(bot.policy.grants);
  const [computerOn, setComputerOn] = useState(bot.computer.enabled);
  const [provider, setProvider] = useState(bot.computer.provider ?? "");
  const [hibernate, setHibernate] = useState(String(bot.computer.hibernateAfterMin ?? ""));
  const [tools, setTools] = useState(bot.tools.join(", "));
  const [skills, setSkills] = useState(bot.skills.join(", "));
  const [cap, setCap] = useState(bot.spendCapUsd === null ? "" : String(bot.spendCapUsd));
  const [capSub, setCapSub] = useState(bot.capIncludesSubscription);
  const [pinned, setPinned] = useState(bot.pinned);
  const [hidden, setHidden] = useState(bot.hidden);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { servers } = useLocalServers(api, isLocalKind(kind));
  const defaultUrl = isLocalKind(kind) ? servers?.find((s) => s.kind === kind)?.baseUrl : undefined;

  // A grant given from an approval card elsewhere shows up here.
  useEffect(() => setGrants(bot.policy.grants), [bot.policy.grants]);

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
      () =>
        onSave({
          name: name.trim(),
          role: role.trim(),
          description,
          avatarColor: color,
          avatarShape: shape,
          reportsTo: reportsTo || null,
          brain: {
            kind,
            ...(model.trim() ? { model: model.trim() } : {}),
            ...(command.trim() ? { command: command.trim() } : {}),
            ...(baseUrl.trim() && takesBaseUrl(kind) ? { baseUrl: baseUrl.trim() } : {}),
            ...(apiKeySecret.trim() && takesBaseUrl(kind) ? { apiKeySecret: apiKeySecret.trim() } : {}),
          },
          policy: { rules: rules.filter((r) => r.tool.trim()).map((r) => ({ tool: r.tool.trim(), decision: r.decision, ...(r.locked ? { locked: true } : {}) })), grants },
          computer: {
            ...bot.computer,
            enabled: computerOn,
            ...(provider ? { provider } : { provider: undefined }),
            ...(hibernate.trim() ? { hibernateAfterMin: Number(hibernate) } : { hibernateAfterMin: undefined }),
          },
          tools: list(tools),
          skills: list(skills),
          spendCapUsd: cap.trim() === "" ? null : Number(cap),
          capIncludesSubscription: capSub,
          pinned,
          hidden,
        }),
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
          <label>
            {t("newbot.reportsTo")}
            <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} name="settings-reports-to">
              <option value="">{t("newbot.noManager")}</option>
              {bots
                .filter((b) => b.id !== bot.id && !b.hidden)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.role ? ` — ${b.role}` : ""}
                  </option>
                ))}
            </select>
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
          {takesBaseUrl(kind) && (
            <>
              <label>
                {t("newbot.baseUrl")}
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultUrl} name="settings-base-url" />
              </label>
              <label>
                {t("settings.apiKeySecret")}
                <input value={apiKeySecret} onChange={(e) => setApiKeySecret(e.target.value.toUpperCase())} placeholder="ANTHROPIC_API_KEY" name="settings-api-key-secret" />
              </label>
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
          <div className="form-row">
            <label>
              {t("settings.provider")}
              <select value={provider} onChange={(e) => setProvider(e.target.value)} name="settings-provider">
                <option value="">{t("settings.providerDefault")}</option>
                <option value="local">local</option>
                <option value="docker">docker</option>
              </select>
            </label>
            <label>
              {t("settings.hibernate")}
              <input type="number" min={1} value={hibernate} placeholder="30" onChange={(e) => setHibernate(e.target.value)} name="settings-hibernate" />
            </label>
          </div>
          <label>
            {t("settings.tools")}
            <input value={tools} onChange={(e) => setTools(e.target.value)} name="settings-tools" />
          </label>
          <label>
            {t("settings.skills")}
            <input value={skills} onChange={(e) => setSkills(e.target.value)} name="settings-skills" />
          </label>
        </fieldset>

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
