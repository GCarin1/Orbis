import { useState } from "react";
import type { BrainKind } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";
import { BRAINS, isLocalKind, ModelField, takesBaseUrl, takesModel, useLocalServers } from "./brains.js";

export interface NewBotInput {
  name: string;
  role: string;
  description: string;
  brain: { kind: BrainKind; model?: string; command?: string; baseUrl?: string };
}

export function NewBotDialog({
  api,
  onCreate,
  onImport,
  onCancel,
}: {
  /** Lets the dialog suggest the models of the local servers. */
  api?: Api | null;
  onCreate(input: NewBotInput): Promise<void>;
  onImport?(yaml: string): Promise<void>;
  onCancel(): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<BrainKind>("claude-code");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { servers } = useLocalServers(api, isLocalKind(kind));
  const defaultUrl = isLocalKind(kind) ? servers?.find((s) => s.kind === kind)?.baseUrl : undefined;

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newbot-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onCreate({
              name: name.trim(),
              role: role.trim(),
              description,
              brain: {
                kind,
                ...(model.trim() ? { model: model.trim() } : {}),
                ...(command.trim() ? { command: command.trim() } : {}),
                ...(baseUrl.trim() && takesBaseUrl(kind) ? { baseUrl: baseUrl.trim() } : {}),
              },
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="newbot-title">{t("newbot.title")}</h2>
        <label>
          {t("newbot.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus name="name" />
        </label>
        <label>
          {t("newbot.role")}
          <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} name="role" />
        </label>
        <label>
          {t("newbot.description")}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("newbot.descriptionHint")} rows={4} name="description" />
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
        {onImport && (
          <label className="import-field">
            {t("newbot.import")}
            <input
              type="file"
              accept=".yaml,.yml,text/yaml"
              name="template"
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
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("newbot.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {t("newbot.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
