// The new-bot screen (specs/web-app): the face first — a color and a shape with
// a live preview — then the name, role, manager and brain, and suggestions that
// fill everything in; templates import from here too.
import { useEffect, useState } from "react";
import { AVATAR_COLORS, AVATAR_SHAPES, chatApiOrigin, type AvatarShape, type Bot, type Brain, type BrainKind, type ChatTokenGroup } from "@orbis/shared";
import { ChatHttpFields, chatHttpBrainFields, chatHttpValue, cleanToken } from "./ChatHttpFields.js";
import type { Api } from "../api.js";
import { useLang, useT, type TextKey } from "../i18n.js";
import { BotFace } from "./Avatar.js";
import { BRAINS, isLocalKind, ModelField, takesBaseUrl, takesModel, useLocalServers } from "./brains.js";

export interface NewBotInput {
  name: string;
  role: string;
  description: string;
  avatarColor: string;
  avatarShape: AvatarShape;
  reportsTo?: string;
  brain: Partial<Brain> & { kind: BrainKind };
  /** chat-http: the Bearer token, saved as its chat API's shared token (never in the bot itself). */
  token?: string;
}

interface Suggestion {
  key: string;
  shape: AvatarShape;
  color: string;
  /** Lead the team: the other suggestions report to it when created after it. */
  lead?: boolean;
}

export const SUGGESTIONS: Suggestion[] = [
  { key: "chief", shape: "orb", color: "#8b5cf6", lead: true },
  { key: "night", shape: "hexagon", color: "#f97316" },
  { key: "inbox", shape: "cloud", color: "#ec4899" },
  { key: "qa", shape: "square", color: "#22c55e" },
  { key: "research", shape: "drop", color: "#3b82f6" },
  { key: "designer", shape: "pill", color: "#f59e0b" },
];

const COLOR_NAMES = ["brown", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "gray"] as const;

export function NewBotScreen({
  api,
  bots,
  onCreate,
  onImport,
}: {
  api?: Api | null;
  bots: Bot[];
  onCreate(input: NewBotInput): Promise<void>;
  onImport?(yaml: string): Promise<void>;
}) {
  const t = useT();
  useLang((s) => s.lang);
  const [color, setColor] = useState<string>("#3b82f6");
  const [shape, setShape] = useState<AvatarShape>("orb");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [kind, setKind] = useState<BrainKind>("claude-code");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [chat, setChat] = useState(chatHttpValue());
  // The chat APIs that already have a token: a new bot of one of them needs none typed.
  const [tokenApis, setTokenApis] = useState<ChatTokenGroup[]>([]);
  useEffect(() => {
    if (!api || kind !== "chat-http") return;
    let live = true;
    api
      .get<ChatTokenGroup[]>("/api/v1/chat-http/tokens")
      .then((groups) => live && setTokenApis(groups))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, kind]);
  const sharedToken = tokenApis.find((g) => g.origin === chatApiOrigin(chat.url))?.token ?? null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { servers } = useLocalServers(api, isLocalKind(kind));
  const defaultUrl = isLocalKind(kind) ? servers?.find((s) => s.kind === kind)?.baseUrl : undefined;
  const visible = bots.filter((b) => !b.hidden);

  const suggest = (s: Suggestion) => {
    setShape(s.shape);
    setColor(s.color);
    setName(t(`suggest.${s.key}.name` as TextKey));
    setRole(t(`suggest.${s.key}.role` as TextKey));
    setDescription(t(`suggest.${s.key}.rules` as TextKey));
    // A specialist reports to the team's lead when there is one.
    const lead = s.lead ? undefined : visible.find((b) => b.reportsTo === null && /chief|chefe/i.test(`${b.role} ${b.name}`));
    setReportsTo(lead?.id ?? "");
  };

  return (
    <section className="screen newbot" aria-labelledby="newbot-title" data-testid="new-bot-screen">
      <header className="screen-head">
        <h1 id="newbot-title">{t("newbot.title")}</h1>
      </header>
      <div className="screen-body">
        <form
          className="newbot-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onCreate({
                name: name.trim(),
                role: role.trim(),
                description,
                avatarColor: color,
                avatarShape: shape,
                ...(reportsTo ? { reportsTo } : {}),
                brain:
                  kind === "chat-http"
                    ? { kind, ...chatHttpBrainFields(chat) }
                    : {
                        kind,
                        ...(model.trim() ? { model: model.trim() } : {}),
                        ...(command.trim() ? { command: command.trim() } : {}),
                        ...(baseUrl.trim() && takesBaseUrl(kind) ? { baseUrl: baseUrl.trim() } : {}),
                      },
                ...(kind === "chat-http" && chat.token.trim() ? { token: cleanToken(chat.token) } : {}),
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="newbot-preview">
            <BotFace shape={shape} color={color} size={128} label={name.trim() || t("newbot.title")} />
          </div>
          <div className="swatches" role="radiogroup" aria-label={t("newbot.color")}>
            {AVATAR_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={t(`color.${COLOR_NAMES[i]}` as TextKey)}
                className="swatch"
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="shapes" role="radiogroup" aria-label={t("newbot.shape")}>
            {AVATAR_SHAPES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === shape} aria-label={t(`shape.${s}` as TextKey)} className="shape" onClick={() => setShape(s)}>
                <BotFace shape={s} color={color} size={34} />
              </button>
            ))}
          </div>

          <div className="newbot-fields">
            <label>
              {t("newbot.name")}
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} name="name" placeholder={t("newbot.namePlaceholder")} />
            </label>
            <label>
              {t("newbot.role")}
              <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} name="role" placeholder={t("newbot.rolePlaceholder")} />
            </label>
            <label>
              {t("newbot.reportsTo")}
              <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} name="reportsTo">
                <option value="">{t("newbot.noManager")}</option>
                {visible.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.role ? ` — ${b.role}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("newbot.brain")}
              <select value={kind} onChange={(e) => setKind(e.target.value as BrainKind)} name="brain">
                {BRAINS.map((k) => (
                  <option key={k} value={k}>
                    {t(`brain.${k}` as TextKey)}
                  </option>
                ))}
              </select>
            </label>
            {takesModel(kind) && <ModelField kind={kind} value={model} onChange={setModel} name="model" servers={servers} />}
            {takesBaseUrl(kind) && (
              <label>
                {t("newbot.baseUrl")}
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultUrl ?? (kind === "openai" ? "https://api.openai.com/v1" : "")} name="baseUrl" />
              </label>
            )}
            {kind === "custom-cli" && (
              <label>
                {t("newbot.command")}
                <input value={command} onChange={(e) => setCommand(e.target.value)} required name="command" />
              </label>
            )}
            {kind === "chat-http" && (
              <div className="wide">
                <ChatHttpFields value={chat} onChange={setChat} hasToken={sharedToken?.saved === true} tokenStatus={sharedToken} name="newbot-chat" />
              </div>
            )}
            <label className="wide">
              {t("newbot.description")}
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("newbot.descriptionHint")} rows={3} name="description" />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="newbot-actions">
            <button type="submit" className="btn btn-primary btn-large" disabled={busy || !name.trim()}>
              {t("newbot.create")}
            </button>
            {onImport && (
              <label className="import-field link">
                {t("newbot.import")}
                <input
                  type="file"
                  accept=".yaml,.yml,text/yaml"
                  name="template"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setError(null);
                    try {
                      await onImport(await file.text());
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              </label>
            )}
          </div>
        </form>

        <section className="suggestions" aria-labelledby="suggestions-title">
          <h2 id="suggestions-title">{t("newbot.suggestions")}</h2>
          <div className="suggestion-grid">
            {SUGGESTIONS.map((s) => (
              <button key={s.key} type="button" className="suggestion" onClick={() => suggest(s)} data-testid={`suggestion-${s.key}`}>
                <BotFace shape={s.shape} color={s.color} size={48} />
                <span>
                  <strong>{t(`suggest.${s.key}.name` as TextKey)}</strong>
                  <span className="muted">{t(`suggest.${s.key}.pitch` as TextKey)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
