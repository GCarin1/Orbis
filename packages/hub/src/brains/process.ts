// Child-process runner shared by the CLI brains (contracts/cli-harnesses).
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export const STDERR_TAIL_BYTES = 8192;

/** Variables a CLI brain may inherit from the hub: shell basics, locale, proxies and its own login. */
const PASSTHROUGH = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  // Windows equivalents of HOME and PATH lookup.
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "PATHEXT",
  "ComSpec",
  // Login locations of the supported CLIs (never API keys).
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "GEMINI_CLI_HOME",
] as const;

/**
 * Build a brain process environment from scratch. Nothing named ORBIS_*, no
 * API key and no secret value reaches the child unless passed in `extra`.
 */
export function harnessEnv(extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSTHROUGH) {
    const value = source[name];
    if (value !== undefined && value !== "") env[name] = value;
  }
  return { ...env, ...extra };
}

function isExecutable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (process.platform === "win32") return true;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Absolute path of an executable, looked up on PATH when bare; null when not found. */
export function resolveExecutable(command: string, envPath = process.env.PATH ?? ""): string | null {
  if (command.includes("/") || command.includes("\\")) {
    return isExecutable(command) ? path.resolve(command) : null;
  }
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export interface ProcessSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export type ProcessEvent =
  | { type: "line"; line: string }
  | {
      type: "exit";
      code: number | null;
      signal: NodeJS.Signals | null;
      stderrTail: string;
      timedOut: boolean;
      aborted: boolean;
      spawnError: string | null;
    };

/** Spawn a process and yield its stdout line by line, then one exit event. */
export async function* runProcess(spec: ProcessSpec): AsyncGenerator<ProcessEvent> {
  const useGroup = process.platform !== "win32";
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: useGroup,
    windowsHide: true,
  });

  let stderr = "";
  let timedOut = false;
  let aborted = false;
  let spawnError: string | null = null;

  const kill = (sig: NodeJS.Signals) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (useGroup && child.pid) process.kill(-child.pid, sig);
      else child.kill(sig);
    } catch {
      child.kill(sig);
    }
  };
  const terminate = () => {
    kill("SIGTERM");
    setTimeout(() => kill("SIGKILL"), 3000).unref();
  };

  const timer = setTimeout(() => {
    timedOut = true;
    terminate();
  }, spec.timeoutMs);
  const onAbort = () => {
    aborted = true;
    terminate();
  };
  if (spec.signal.aborted) onAbort();
  else spec.signal.addEventListener("abort", onAbort, { once: true });

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("error", (err) => {
      spawnError = err.message;
      resolve({ code: null, signal: null });
    });
    child.on("close", (code, signal) => resolve({ code, signal }));
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES);
  });
  child.stdin.on("error", () => {
    /* the child may exit before reading stdin */
  });
  if (spec.stdin !== undefined) child.stdin.end(spec.stdin);
  else child.stdin.end();

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let completed = false;
  try {
    for await (const line of rl) {
      yield { type: "line", line };
    }
    const { code, signal } = await exited;
    completed = true;
    clearTimeout(timer);
    spec.signal.removeEventListener("abort", onAbort);
    yield { type: "exit", code, signal, stderrTail: stderr, timedOut, aborted, spawnError };
  } finally {
    rl.close();
    clearTimeout(timer);
    spec.signal.removeEventListener("abort", onAbort);
    // The consumer stopped early (a failure or a cancel): do not leave the child running.
    if (!completed) terminate();
  }
}

/** A short failure message for a process that did not end cleanly. */
export function describeExit(exit: Extract<ProcessEvent, { type: "exit" }>, timeoutMs: number): string {
  if (exit.spawnError) return `could not start the brain process: ${exit.spawnError}`;
  if (exit.timedOut) return `timed out after ${Math.round(timeoutMs / 1000)}s`;
  if (exit.aborted) return "cancelled";
  const tail = exit.stderrTail.trim();
  const status = exit.code !== null ? `exit code ${exit.code}` : `signal ${exit.signal}`;
  return tail ? `${status}: ${tail}` : status;
}
