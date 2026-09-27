// The `local` provider: the bot's computer is a set of directories and child
// processes on the hub host. Not a security boundary (ADR 0005); commands see
// a scrubbed environment and the bot's own HOME.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Bot } from "@orbis/shared";
import type { ComputerPaths, ComputerProvider, ComputerView, ExecOptions, ExecResult } from "./provider.js";

/** The only hub variables a command inherits (specs/computer). */
export function shellEnv(paths: ComputerPaths, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {
    PATH: source.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: paths.home,
    LANG: source.LANG || "C.UTF-8",
    TERM: "dumb",
  };
  if (process.platform === "win32") {
    // cmd.exe cannot start without these.
    for (const name of ["SystemRoot", "ComSpec", "PATHEXT"]) if (source[name]) env[name] = source[name]!;
  }
  return env;
}

/** Run `command` through the platform shell, killing its whole process group on timeout or abort. */
export function runShell(command: string, cwd: string, env: Record<string, string>, opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve) => {
    const win = process.platform === "win32";
    const child = spawn(win ? (env.ComSpec ?? "cmd.exe") : "/bin/sh", win ? ["/d", "/s", "/c", command] : ["-c", command], {
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
