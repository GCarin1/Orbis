// Hub configuration from the environment (contracts/hub-surface § Environment).
// An empty value is treated exactly like an unset one, so a blank line in
// `.env` falls back to the default instead of becoming "".
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DEFAULT_HOST, DEFAULT_PORT, ORBIS_VERSION, type ComputerProviderKind } from "@orbis/shared";

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
  absencePauseDays: number;
  computerProvider: ComputerProviderKind;
  logLevel: LogLevel;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  /** Directory of the built web app; null disables static serving. */
  webDir: string | null;
  /** Chromium for the local browser tools; null uses Playwright's own browser. */
  browserExecutable: string | null;
}

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
    maxHandoffDepth: overrides.maxHandoffDepth ?? readPositiveInt(env, "ORBIS_MAX_HANDOFF_DEPTH", 4),
    absencePauseDays: overrides.absencePauseDays ?? readPositiveInt(env, "ORBIS_ABSENCE_PAUSE_DAYS", 14),
    computerProvider:
      overrides.computerProvider ?? readEnum(env, "ORBIS_COMPUTER_PROVIDER", ["local", "docker"] as const, "local"),
    logLevel: overrides.logLevel ?? readEnum(env, "ORBIS_LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
    anthropicApiKey: overrides.anthropicApiKey ?? readVar(env, "ANTHROPIC_API_KEY") ?? null,
    openaiApiKey: overrides.openaiApiKey ?? readVar(env, "OPENAI_API_KEY") ?? null,
    webDir: overrides.webDir === undefined ? null : overrides.webDir,
    browserExecutable: overrides.browserExecutable ?? readVar(env, "ORBIS_BROWSER_EXECUTABLE") ?? null,
  };
}
