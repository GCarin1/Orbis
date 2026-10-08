// Hub configuration from the environment (contracts/hub-surface § Environment).
// An empty value is treated exactly like an unset one, so a blank line in
// `.env` falls back to the default instead of becoming "".
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DEFAULT_HOST, DEFAULT_PORT, ORBIS_VERSION, type ComputerProviderKind } from "@orbis/shared";
import { PRICES, type Price } from "./brains/pricing.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface HubConfig {
  version: string;
  port: number;
  host: string;
  dataDir: string;
  token: string;
  /** Path of the token file, or null when the token came from ORBIS_TOKEN. */
  tokenFile: string | null;
  masterKey: string | null;
  maxBots: number;
  maxGroupSize: number;
  maxHandoffDepth: number;
  /** Runs one message may set off in all, through handoffs, reports and mentions. */
  maxChainRuns: number;
  absencePauseDays: number;
  computerProvider: ComputerProviderKind;
  logLevel: LogLevel;
  anthropicApiKey: string | null;
  /**
   * The Claude subscription's token (`claude setup-token`) from CLAUDE_CODE_OAUTH_TOKEN, for Claude Code
   * when none is saved in Orbis; never an API key.
   */
  claudeOauthToken: string | null;
  openaiApiKey: string | null;
  /** OpenAI-compatible address of the local Ollama server, for `ollama` brains that name none. */
  ollamaBaseUrl: string;
  /** OpenAI-compatible address of the local LM Studio server, for `lmstudio` brains that name none. */
  lmstudioBaseUrl: string;
  /** OpenAI-compatible transcription service for voice input; the settings screen overrides it. */
  transcribeUrl: string | null;
  transcribeModel: string | null;
  transcribeApiKey: string | null;
  /** Directory of the built web app; null disables static serving. */
  webDir: string | null;
  /** Chromium for the local browser tools; null uses Playwright's own browser. */
  browserExecutable: string | null;
  /** USD per million tokens by model prefix: the shipped table with `<data>/prices.json` over it. */
  prices: Record<string, Price>;
  /**
   * The Supabase project whose accounts sign in with an email and a password (change 0064): its address and
   * publishable key, both public by design; null when ORBIS_SUPABASE_URL is `off`.
   */
  supabase: { url: string; key: string } | null;
}

/** The Orbis cloud project (ADR 0020); a hub of another project sets ORBIS_SUPABASE_URL and ORBIS_SUPABASE_KEY. */
export const DEFAULT_SUPABASE = { url: "https://tqjxkgxmnkypzbpirztw.supabase.co", key: "sb_publishable_Cw2RD01Yq0XADHZcncziSA_7e3suhPT" };

function readSupabase(env: Env): { url: string; key: string } | null {
  const url = readVar(env, "ORBIS_SUPABASE_URL");
  if (url?.toLowerCase() === "off") return null;
  if (!url) return { ...DEFAULT_SUPABASE, key: readVar(env, "ORBIS_SUPABASE_KEY") ?? DEFAULT_SUPABASE.key };
  if (!/^https:\/\/[^/?#]+$/.test(url.replace(/\/+$/, ""))) throw new Error(`ORBIS_SUPABASE_URL must be https://<project>.supabase.co or off, got "${url}"`);
  const key = readVar(env, "ORBIS_SUPABASE_KEY");
  if (!key) throw new Error("ORBIS_SUPABASE_KEY must be set with ORBIS_SUPABASE_URL (the project's publishable key)");
  return { url: url.replace(/\/+$/, ""), key };
}

export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";
export const DEFAULT_LMSTUDIO_URL = "http://127.0.0.1:1234/v1";

export type Env = Record<string, string | undefined>;

/** The raw value of a variable, with empty or blank treated as unset. */
function readVar(env: Env, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readPositiveInt(env: Env, name: string, fallback: number): number {
  const raw = readVar(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function readEnum<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = readVar(env, name);
  if (raw === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${name} must be one of ${allowed.join("|")}, got "${raw}"`);
  }
  return raw as T;
}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export function defaultDataDir(): string {
  return path.join(homedir(), ".orbis");
}

/** Read ORBIS_TOKEN, else the data directory token file, else create that file. */
function resolveToken(env: Env, dataDir: string): { token: string; tokenFile: string | null } {
  const fromEnv = readVar(env, "ORBIS_TOKEN");
  if (fromEnv) return { token: fromEnv, tokenFile: null };
  const tokenFile = path.join(dataDir, "token");
  if (existsSync(tokenFile)) {
    const token = readFileSync(tokenFile, "utf8").trim();
    if (token) return { token, tokenFile };
  }
  const token = randomBytes(32).toString("base64url");
  writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return { token, tokenFile };
}

export interface ConfigOverrides extends Partial<Omit<HubConfig, "token" | "tokenFile">> {
  token?: string;
}

export function loadConfig(env: Env = process.env, overrides: ConfigOverrides = {}): HubConfig {
  const dataDir = path.resolve(expandHome(overrides.dataDir ?? readVar(env, "ORBIS_DATA_DIR") ?? defaultDataDir()));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const { token, tokenFile } = overrides.token
    ? { token: overrides.token, tokenFile: null }
    : resolveToken(env, dataDir);

  return {
    version: ORBIS_VERSION,
    port: overrides.port ?? readPositiveInt(env, "ORBIS_PORT", DEFAULT_PORT),
    host: overrides.host ?? readVar(env, "ORBIS_HOST") ?? DEFAULT_HOST,
    dataDir,
    token,
    tokenFile,
    masterKey: overrides.masterKey ?? readVar(env, "ORBIS_MASTER_KEY") ?? null,
    maxBots: overrides.maxBots ?? readPositiveInt(env, "ORBIS_MAX_BOTS", 50),
    maxGroupSize: overrides.maxGroupSize ?? readPositiveInt(env, "ORBIS_MAX_GROUP_SIZE", 6),
    maxHandoffDepth: overrides.maxHandoffDepth ?? readPositiveInt(env, "ORBIS_MAX_HANDOFF_DEPTH", 6),
    maxChainRuns: overrides.maxChainRuns ?? readPositiveInt(env, "ORBIS_MAX_CHAIN_RUNS", 12),
    absencePauseDays: overrides.absencePauseDays ?? readPositiveInt(env, "ORBIS_ABSENCE_PAUSE_DAYS", 14),
    computerProvider:
      overrides.computerProvider ?? readEnum(env, "ORBIS_COMPUTER_PROVIDER", ["local", "host", "docker"] as const, "local"),
    logLevel: overrides.logLevel ?? readEnum(env, "ORBIS_LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
    anthropicApiKey: overrides.anthropicApiKey ?? readVar(env, "ANTHROPIC_API_KEY") ?? null,
    claudeOauthToken: overrides.claudeOauthToken ?? readVar(env, "CLAUDE_CODE_OAUTH_TOKEN") ?? null,
    openaiApiKey: overrides.openaiApiKey ?? readVar(env, "OPENAI_API_KEY") ?? null,
    ollamaBaseUrl: overrides.ollamaBaseUrl ?? readVar(env, "ORBIS_OLLAMA_URL") ?? DEFAULT_OLLAMA_URL,
    lmstudioBaseUrl: overrides.lmstudioBaseUrl ?? readVar(env, "ORBIS_LMSTUDIO_URL") ?? DEFAULT_LMSTUDIO_URL,
    transcribeUrl: overrides.transcribeUrl ?? readVar(env, "ORBIS_TRANSCRIBE_URL") ?? null,
    transcribeModel: overrides.transcribeModel ?? readVar(env, "ORBIS_TRANSCRIBE_MODEL") ?? null,
    transcribeApiKey: overrides.transcribeApiKey ?? readVar(env, "ORBIS_TRANSCRIBE_API_KEY") ?? null,
    webDir: overrides.webDir === undefined ? null : overrides.webDir,
    browserExecutable: overrides.browserExecutable ?? readVar(env, "ORBIS_BROWSER_EXECUTABLE") ?? null,
    prices: overrides.prices ?? loadPrices(dataDir),
    supabase: overrides.supabase !== undefined ? overrides.supabase : readSupabase(env),
  };
}

/** The shipped price table, extended and overridden by `<data>/prices.json` when present. */
export function loadPrices(dataDir: string): Record<string, Price> {
  const file = path.join(dataDir, "prices.json");
  if (!existsSync(file)) return { ...PRICES };
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, Partial<Price>>;
  const table: Record<string, Price> = { ...PRICES };
  for (const [model, price] of Object.entries(parsed)) {
    if (typeof price?.input !== "number" || typeof price?.output !== "number") {
      throw new Error(`${file}: "${model}" needs numeric input and output prices (USD per million tokens)`);
    }
    table[model] = price as Price;
  }
  return table;
}
