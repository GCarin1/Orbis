import { useState } from "react";
import type { BrainKind } from "@orbis/shared";
import { useT, type TextKey } from "../i18n.js";

const BRAINS: BrainKind[] = ["claude-code", "codex", "gemini-cli", "anthropic", "openai", "custom-cli", "mock"];

export interface NewBotInput {
  name: string;
  role: string;
  description: string;
  brain: { kind: BrainKind; model?: string; command?: string };
}

export function NewBotDialog({ onCreate, onCancel }: { onCreate(input: NewBotInput): Promise<void>; onCancel(): void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<BrainKind>("claude-code");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
              brain: { kind, ...(model.trim() ? { model: model.trim() } : {}), ...(command.trim() ? { command: command.trim() } : {}) },
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
        {kind !== "mock" && kind !== "custom-cli" && (
          <label>
            {t("newbot.model")}
            <input value={model} onChange={(e) => setModel(e.target.value)} name="model" />
          </label>
        )}
        {kind === "custom-cli" && (
          <label>
            {t("newbot.command")}
            <input value={command} onChange={(e) => setCommand(e.target.value)} required name="command" />
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
