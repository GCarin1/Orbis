// Where the CLI finds the hub (specs/cli): flags, then ORBIS_URL / ORBIS_TOKEN,
// then ~/.config/orbis/config.json, then a hub on this machine (its token file).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_HOST, DEFAULT_PORT } from "@orbis/shared";

export interface Connection {
  url: string;
  token: string | null;
  /** Where each value came from, for `orbis login --status` and error messages. */
  source: { url: string; token: string };
}

export interface ConfigFile {
  url?: string;
  token?: string;
}

type Env = Record<string, string | undefined>;

const nonEmpty = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined);

export function homeDir(env: Env): string {
  return env.HOME ?? env.USERPROFILE ?? process.cwd();
}

export function configFilePath(env: Env): string {
  const base = nonEmpty(env.XDG_CONFIG_HOME) ?? path.join(homeDir(env), ".config");
  return path.join(base, "orbis", "config.json");
}

export function readConfigFile(env: Env): ConfigFile {
  const file = configFilePath(env);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

export function writeConfigFile(env: Env, data: ConfigFile): string {
  const file = configFilePath(env);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function localTokenFile(env: Env): string {
  const dataDir = nonEmpty(env.ORBIS_DATA_DIR) ?? path.join(homeDir(env), ".orbis");
  return path.join(dataDir.replace(/^~(?=$|\/)/, homeDir(env)), "token");
}

export function resolveConnection(flags: { url?: string; token?: string }, env: Env): Connection {
  const file = readConfigFile(env);
  const localFile = localTokenFile(env);
  const localToken = existsSync(localFile) ? nonEmpty(readFileSync(localFile, "utf8")) : undefined;

  const urlCandidates: Array<[string | undefined, string]> = [
    [nonEmpty(flags.url), "--url"],
    [nonEmpty(env.ORBIS_URL), "ORBIS_URL"],
    [nonEmpty(file.url), configFilePath(env)],
    [`http://${DEFAULT_HOST}:${DEFAULT_PORT}`, "default"],
  ];
  const tokenCandidates: Array<[string | undefined, string]> = [
    [nonEmpty(flags.token), "--token"],
    [nonEmpty(env.ORBIS_TOKEN), "ORBIS_TOKEN"],
    [nonEmpty(file.token), configFilePath(env)],
    [localToken, localFile],
  ];
  const [url, urlSource] = urlCandidates.find(([v]) => v !== undefined)!;
  const token = tokenCandidates.find(([v]) => v !== undefined);
  return {
    url: url!.replace(/\/+$/, ""),
    token: token?.[0] ?? null,
    source: { url: urlSource, token: token?.[1] ?? "none" },
  };
}
