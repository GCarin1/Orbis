// Child-process runner shared by the CLI brains (contracts/cli-harnesses).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export const STDERR_TAIL_BYTES = 8192;

/**
 * A prompt longer than this goes to a CLI brain on stdin instead of its
 * command line: Windows caps a whole command line at 32,767 characters, and a
 * pasted document plus the conversation can pass that.
 */
export const MAX_ARGV_PROMPT = 8_000;

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

/**
 * The program behind a Windows `.cmd` shim, so it runs without cmd.exe (a
 * shell would cut a multi-line prompt at its first line break): the Node
 * script of npm's cmd-shim (`"%dp0%\node_modules\pkg\cli.js"`), the native
 * program it may point to instead (`…\bin\claude.exe`, Claude Code 2), or
 * the `*-cli.js` that npm's own `npm.cmd` and `npx.cmd` set in a variable
 * (`SET "NPX_CLI_JS=%~dp0\node_modules\npm\bin\npx-cli.js"`). Null when
 * the file names none of these.
 */
export function unwrapCmdShim(
  shimPath: string,
  text: string,
  fileExists: (file: string) => boolean = existsSync,
  nodePath: string = process.execPath,
): { command: string; args: string[] } | null {
  const win = path.win32;
  const dir = win.dirname(shimPath);
  const resolve = (p: string) => win.normalize(p.replace(/%~dp0\\?|%dp0%\\?/gi, `${dir}\\`));
  // Quoted paths relative to the shim, with a leading `NAME=` of a SET dropped.
  const paths = [...text.matchAll(/"([^"\r\n]+)"/g)].map((m) => m[1]!.replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "")).filter((q) => /%~?dp0%?/i.test(q));
  const scripts = paths.filter((q) => /\.[cm]?js$/i.test(q));
  const script = scripts.find((q) => /-cli\.[cm]?js$/i.test(q)) ?? scripts.find((q) => !/prefix/i.test(q));
  const localNode = win.join(dir, "node.exe");
  if (script) return { command: fileExists(localNode) ? localNode : nodePath, args: [resolve(script)] };
  const program = paths.find((q) => /\.exe$/i.test(q) && !/[\\/]node\.exe$/i.test(q));
  if (program) return { command: resolve(program), args: [] };
  return null;
}

/** How to start a command here: on Windows a `.cmd`/`.bat` shim runs its Node script directly. */
export function launchCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  read: (file: string) => string = (file) => readFileSync(file, "utf8"),
  fileExists: (file: string) => boolean = existsSync,
): { command: string; args: string[] } {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) return { command, args };
  let text = "";
  try {
    text = read(command);
  } catch {
    /* reported below */
  }
  const target = unwrapCmdShim(command, text, fileExists);
  if (!target) {
    throw new Error(
      `${command} is a Windows batch file, which Orbis cannot run without cmd.exe (it cuts multi-line prompts); set the brain's command to the program's .exe or its .js entry`,
    );
  }
  return { command: target.command, args: [...target.args, ...args] };
}

export interface ProcessSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  /**
   * A wall-clock limit, for callers outside a run (a brain test). A run's
   * brain leaves it out: the engine's clock stops the process through
   * `signal`, and does not count the time spent waiting for the user.
   */
  timeoutMs?: number;
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
  let child: ChildProcessWithoutNullStreams;
  try {
    const launch = launchCommand(spec.command, spec.args);
    child = spawn(launch.command, launch.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: useGroup,
      windowsHide: true,
    });
  } catch (err) {
    // A shim that cannot be unwrapped, or a spawn refused outright (EINVAL on a .cmd).
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "exit", code: null, signal: null, stderrTail: "", timedOut: false, aborted: false, spawnError: message };
    return;
  }

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

  const timer =
    spec.timeoutMs !== undefined && Number.isFinite(spec.timeoutMs)
      ? setTimeout(() => {
          timedOut = true;
          terminate();
        }, spec.timeoutMs)
      : undefined;
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
