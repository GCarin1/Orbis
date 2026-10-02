// The key of an API brain (OpenAI-compatible, Anthropic, a local server with a key), typed once and
// kept in the bot's vault (specs/secrets): the field never shows it back, only that one is saved.
import type { Brain, BrainKind } from "@orbis/shared";
import { useT } from "../i18n.js";

const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/** The vault name the bot's key goes under: the name the bot already uses, or `API_KEY`. */
export const keySecretName = (current: string | undefined) => (current && SECRET_NAME.test(current) ? current : "API_KEY");

export type KeyHeader = NonNullable<Brain["apiKeyHeader"]>;

export function ApiKeyFields({
  kind,
  apiKey,
  onApiKey,
  header,
  onHeader,
  saved,
  name,
}: {
  kind: BrainKind;
  apiKey: string;
  onApiKey(value: string): void;
  header: KeyHeader;
  onHeader(value: KeyHeader): void;
  /** A key is already in the vault: an empty field keeps it. */
  saved: boolean;
  name: string;
}) {
  const t = useT();
  const local = kind === "ollama" || kind === "lmstudio";
  return (
    <>
      <label>
        {t("apiKey.label")}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => onApiKey(e.target.value)}
          placeholder={saved ? t("apiKey.saved") : local ? t("apiKey.optional") : kind === "anthropic" ? "sk-ant-…" : "sk-…"}
          name={`${name}-api-key`}
        />
      </label>
      {kind === "openai" && (
        <>
          <label>
            {t("apiKey.header")}
            <select value={header} onChange={(e) => onHeader(e.target.value as KeyHeader)} name={`${name}-api-key-header`}>
              <option value="bearer">{t("apiKey.header.bearer")}</option>
              <option value="api-key">{t("apiKey.header.apiKey")}</option>
            </select>
          </label>
          <p className="muted settings-help">{t("apiKey.gatewayHelp")}</p>
        </>
      )}
    </>
  );
}
