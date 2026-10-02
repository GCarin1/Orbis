// Brain choices shared by the new-bot dialog, the bot settings and the settings
// screen (specs/web-app, specs/agent-runtimes).
import { useEffect, useState } from "react";
import type { BrainKind, BrainTestResult, LocalModelServer } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";

/** Subscription CLIs first, then local models, then paid APIs. */
export const BRAINS: BrainKind[] = ["claude-code", "codex", "gemini-cli", "cursor", "ollama", "lmstudio", "anthropic", "openai", "chat-http", "custom-cli", "mock"];

export const isLocalKind = (kind: BrainKind): kind is "ollama" | "lmstudio" => kind === "ollama" || kind === "lmstudio";
export const takesBaseUrl = (kind: BrainKind) => kind === "openai" || kind === "anthropic" || isLocalKind(kind);
/** chat-http has its own fields (ChatHttpFields), its model among them. */
export const takesModel = (kind: BrainKind) => kind !== "mock" && kind !== "custom-cli" && kind !== "chat-http";
/** Brains that cannot run without a model (the others use their program's default). */
export const needsModel = (kind: BrainKind) => kind === "openai" || isLocalKind(kind);

/** The local model servers the hub sees, or null while loading (or with no API). */
export function useLocalServers(api: Api | null | undefined, enabled = true): { servers: LocalModelServer[] | null; reload(): void } {
  const [servers, setServers] = useState<LocalModelServer[] | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!api || !enabled) return;
    let live = true;
    api
      .get<LocalModelServer[]>("/api/v1/runtimes/local")
      .then((s) => live && setServers(s))
      .catch(() => live && setServers([]));
    return () => {
      live = false;
    };
  }, [api, enabled, round]);
  return { servers, reload: () => setRound((r) => r + 1) };
}

/** The model field: for Ollama and LM Studio it suggests the models the server has. */
export function ModelField({
  kind,
  value,
  onChange,
  name,
  servers,
}: {
  kind: BrainKind;
  value: string;
  onChange(value: string): void;
  name: string;
  servers: LocalModelServer[] | null;
}) {
  const t = useT();
  const server = isLocalKind(kind) ? servers?.find((s) => s.kind === kind) : undefined;
  const listId = `${name}-models`;
  return (
    <label>
      {needsModel(kind) ? t("brains.model") : t("newbot.model")}
      <input value={value} onChange={(e) => onChange(e.target.value)} name={name} required={needsModel(kind)} list={server?.models.length ? listId : undefined} />
      {server && server.models.length > 0 && (
        <datalist id={listId}>
          {server.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
      {server && !server.reachable && <small className="muted">{t("brains.notRunning", { url: server.baseUrl })}</small>}
      {server && server.reachable && server.models.length === 0 && <small className="muted">{t("brains.noModels")}</small>}
    </label>
  );
}

export type TestState = { pending: true } | { pending: false; result: BrainTestResult };

/** Pending, answered, echoed or failed: what a brain test said. */
export function TestResultView({ state }: { state: TestState | undefined }) {
  const t = useT();
  if (!state) return null;
  if (state.pending) {
    return (
      <p className="brain-test pending" role="status">
        {t("brains.testing")}
      </p>
    );
  }
  const { result } = state;
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (!result.ok) {
    return (
      <p className="brain-test failed" role="status">
        ✗ {t("brains.failed", { error: result.error ?? "?" })}
      </p>
    );
  }
  return (
    <p className={`brain-test ${result.answered ? "answered" : "echo"}`} role="status">
      {result.answered ? "✓" : "⚠"} {t("brains.answered", { seconds, reply: result.reply })}
      {!result.answered && (
        <>
          <br />
          {t("brains.echo")}
        </>
      )}
    </p>
  );
}

export const brainLabel = (t: ReturnType<typeof useT>, kind: BrainKind) => t(`brain.${kind}` as TextKey);
export const brainShort = (t: ReturnType<typeof useT>, kind: BrainKind) => t(`brainShort.${kind}` as TextKey);
