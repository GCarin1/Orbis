// The `local` provider: the bot's computer is a set of directories and child
// processes on the hub host. Not a security boundary (ADR 0005); commands see
// a scrubbed environment and the bot's own HOME.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Bot } from "@orbis/shared";
import type { ComputerPaths, ComputerProvider, ComputerView, ExecOptions, ExecResult } from "./provider.js";

/** Windows variables that name the system, not the user: programs fail without them. */
const WINDOWS_SYSTEM = [
  "SystemRoot",
  "SystemDrive",
  "windir",
  "ComSpec",
  "PATHEXT",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramData",
  "CommonProgramFiles",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
];

/** The bot's own Windows profile folders, under its HOME (created by `ensure`). */
export function windowsProfile(home: string): Record<string, string> {
  const local = path.join(home, "AppData", "Local");
  return {
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: local,
    TEMP: path.join(local, "Temp"),
    TMP: path.join(local, "Temp"),
  };
}

/** The only hub variables a command inherits (specs/computer). */
export function shellEnv(paths: ComputerPaths, source: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const env: Record<string, string> = {
    PATH: source.PATH || source.Path || "/usr/local/bin:/usr/bin:/bin",
    HOME: paths.home,
    LANG: source.LANG || "C.UTF-8",
    TERM: "dumb",
  };
  if (platform === "win32") {
    // cmd.exe, npm, git and python need the system's variables and a profile of their own
    // (APPDATA, TEMP…), else they fail; Python writes UTF-8 to the pipe instead of the ANSI code page.
    for (const name of WINDOWS_SYSTEM) if (source[name]) env[name] = source[name]!;
    Object.assign(env, windowsProfile(paths.home), { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" });
  }
  return env;
}

/**
 * The shell and its arguments for a command. On Windows, cmd.exe writes in the
 * console's OEM code page (850 in Brazil), so "não" arrived as "n�o": the
 * command first switches the console to UTF-8.
 */
export function shellCommand(command: string, env: Record<string, string>, platform: NodeJS.Platform = process.platform): { file: string; args: string[] } {
  if (platform === "win32") return { file: env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `chcp 65001 >nul & ${command}`] };
  return { file: "/bin/sh", args: ["-c", command] };
}

/** Run `command` through the platform shell, killing its whole process group on timeout or abort. */
export function runShell(command: string, cwd: string, env: Record<string, string>, opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve) => {
    const win = process.platform === "win32";
    const shell = shellCommand(command, env);
    const child = spawn(shell.file, shell.args, {
      cwd,
      env,
      detached: !win,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let kept = 0;
    let dropped = 0;
    let timedOut = false;
    let settled = false;
    const collect = (chunk: Buffer) => {
      const room = opts.outputCap - kept;
      if (room > 0) {
        chunks.push(chunk.subarray(0, room));
        kept += Math.min(room, chunk.length);
      }
      dropped += Math.max(0, chunk.length - Math.max(room, 0));
    };
    child.stdout!.on("data", collect);
    child.stderr!.on("data", collect);

    const kill = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (!win && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
    const onAbort = () => kill();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, output: Buffer.concat(chunks).toString("utf8"), timedOut, droppedBytes: dropped });
    };
    child.on("error", (err) => {
      chunks.push(Buffer.from(String(err.message)));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

export class LocalProvider implements ComputerProvider {
  readonly kind = "local";

  async ensure(_bot: Bot, paths: ComputerPaths): Promise<void> {
    for (const dir of [paths.workspace, paths.home]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform === "win32") {
      const profile = windowsProfile(paths.home);
      for (const dir of [profile.APPDATA!, profile.TEMP!]) mkdirSync(dir, { recursive: true });
    }
  }

  async exec(_bot: Bot, paths: ComputerPaths, command: string, opts: ExecOptions): Promise<ExecResult> {
    return runShell(command, paths.workspace, shellEnv(paths), opts);
  }

  async stop(): Promise<void> {
    // Nothing keeps running between commands; the browser is closed by the manager.
  }

  async destroy(): Promise<void> {
    // The manager removes the bot's directories.
  }

  async view(): Promise<ComputerView> {
    return { vncPort: null, cdpPort: null };
  }
}
