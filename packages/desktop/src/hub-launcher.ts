// Find or start the hub the desktop app shows (specs/desktop-app).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const DEFAULT_HUB_URL = "http://127.0.0.1:7420";

export interface LaunchOptions {
  /** The hub URL from the settings. */
  url: string;
  /** Data directory of a hub on this machine (for its token file); default ORBIS_DATA_DIR or ~/.orbis. */
  dataDir?: string;
  /** The hub's entry script; default the bundled @orbis/hub. */
  hubEntry?: string;
  /** Node.js executable that runs the hub; default ORBIS_NODE or `node` on PATH. */
  node?: string;
  /** How long to wait for a started hub to answer /health. */
  timeoutMs?: number;
  health?: (url: string) => Promise<boolean>;
  spawnHub?: (entry: string, env: NodeJS.ProcessEnv) => ChildProcess;
}

export interface LaunchedHub {
  url: string;
  /** The API token of a hub on this machine, or null (the web app then asks for it). */
  token: string | null;
  /** The hub process the app started, stopped when the app quits; null for a hub that was already running. */
  child: ChildProcess | null;
}

/** True when the hub answers GET /health with `{ ok: true }`. */
export async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ORBIS_DATA_DIR?.trim();
  if (configured) return path.resolve(configured.replace(/^~(?=$|[/\\])/, homedir()));
  return path.join(homedir(), ".orbis");
}

/** The bundled hub's `main.js` (next to the @orbis/hub package entry). */
export function bundledHubEntry(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("@orbis/hub")), "main.js");
}

function readToken(dataDir: string): string | null {
  const file = path.join(dataDir, "token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() || null : null;
}

const isLocal = (url: URL) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);

/**
 * Use the hub that answers at `url`; otherwise start the bundled hub on that
 * address with the system Node.js and wait until it answers /health.
 */
export async function ensureHub(opts: LaunchOptions): Promise<LaunchedHub> {
  const url = new URL(opts.url);
  const base = url.origin;
  const health = opts.health ?? healthy;
  const dataDir = opts.dataDir ?? defaultDataDir();
  if (await health(base)) return { url: base, token: isLocal(url) ? readToken(dataDir) : null, child: null };
  if (!isLocal(url)) throw new Error(`no Orbis hub answers at ${base}; start it there, or point the app at a local hub`);

  const entry = opts.hubEntry ?? bundledHubEntry();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ORBIS_HOST: url.hostname.replace(/^\[|\]$/g, ""),
    ORBIS_PORT: url.port || "80",
    ORBIS_DATA_DIR: dataDir,
  };
  const start =
    opts.spawnHub ??
    ((file: string, childEnv: NodeJS.ProcessEnv) =>
      spawn(opts.node ?? process.env.ORBIS_NODE ?? "node", [file], { env: childEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }));
  const child = start(entry, env);
  let exited: string | null = null;
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
  child.once("exit", (code, signal) => (exited = `exited with ${signal ?? `code ${code}`}`));
  child.once("error", (err) => (exited = err.message));

  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  while (Date.now() < deadline) {
    if (exited) throw new Error(`the bundled hub ${exited}${stderr ? `: ${stderr.trim().split("\n").slice(-3).join(" ")}` : ""}`);
    if (await health(base)) return { url: base, token: readToken(dataDir), child };
    await delay(200);
  }
  child.kill();
  throw new Error(`the bundled hub did not answer ${base}/health within ${Math.round((opts.timeoutMs ?? 20_000) / 1000)}s`);
}
