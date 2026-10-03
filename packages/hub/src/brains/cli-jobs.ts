// Runs a subscription CLI's own commands for the settings screen (specs/agent-runtimes):
// short ones (`--version`, a login status) to completion, and one long job at a
// time (an install, a sign-in that waits for the browser) whose output the
// screen polls. Shared by the Codex and Claude accounts.
import { spawn, type ChildProcess } from "node:child_process";
import type { CliJob } from "@orbis/shared";
import { harnessEnv, launchCommand } from "./process.js";

export const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const LOG_CHARS = 6_000;

export interface RunResult {
  code: number | null;
  output: string;
}

export class CliJobs {
  private job: CliJob | null = null;
  private child: ChildProcess | null = null;

  /**
   * `onLog` reads what a job printed so far (the sign-in page, a device code) into the job; `extraEnv`
   * adds the CLI's own login variables (Claude Code's subscription token) to the short commands — a
   * status reads the account runs use — and not to a sign-in, which makes a login of its own.
   */
  constructor(
    private readonly envPath: () => string = () => process.env.PATH ?? "",
    private readonly onLog: (job: CliJob) => void = () => undefined,
    private readonly extraEnv: () => Record<string, string> = () => ({}),
  ) {}

  private start(file: string, args: string[], stdin = false, extra: Record<string, string> = {}): ChildProcess {
    const launch = launchCommand(file, args);
    return spawn(launch.command, launch.args, {
      env: harnessEnv({ ...extra, PATH: this.envPath(), NO_COLOR: "1" }),
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  /** Run a short command to its end. */
  run(file: string, args: string[], timeoutMs: number): Promise<RunResult> {
    return new Promise((resolve) => {
      let output = "";
      let child: ChildProcess;
      try {
        child = this.start(file, args, false, this.extraEnv());
      } catch (err) {
        resolve({ code: null, output: err instanceof Error ? err.message : String(err) });
        return;
      }
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout!.on("data", (d: Buffer) => (output += d.toString("utf8")));
      child.stderr!.on("data", (d: Buffer) => (output += d.toString("utf8")));
      child.on("error", (err) => (output += err.message));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  }

  /** The latest job (a copy), or null when none has run. */
  current(): CliJob | null {
    return this.job ? { ...this.job } : null;
  }

  /** Start a long job; one at a time (a running one is returned as it is). `stdin` keeps its input open for `write`. */
  begin(kind: CliJob["kind"], file: string, args: string[], timeoutMs: number, stdin = false): CliJob {
    if (this.job?.state === "running") return { ...this.job };
    const job: CliJob = { kind, state: "running", startedAt: new Date().toISOString(), finishedAt: null, url: null, code: null, log: "", error: null };
    this.job = job;
    let child: ChildProcess;
    try {
      child = this.start(file, args, stdin);
    } catch (err) {
      job.state = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date().toISOString();
      return { ...job };
    }
    this.child = child;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const collect = (d: Buffer) => {
      job.log = (job.log + d.toString("utf8").replace(ANSI, "")).slice(-LOG_CHARS);
      if (kind === "login") this.onLog(job);
    };
    child.stdout!.on("data", collect);
    child.stderr!.on("data", collect);
    child.on("error", (err) => (job.error = err.message));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (this.child === child) this.child = null;
      job.finishedAt = new Date().toISOString();
      if (code === 0) job.state = "done";
      else {
        job.state = "failed";
        job.error =
          job.error ??
          (signal === "SIGTERM"
            ? "cancelled"
            : signal
              ? "it took too long and was stopped"
              : job.log.trim().split("\n").filter(Boolean).slice(-2).join(" ") || `exit code ${code}`);
      }
    });
    return { ...job };
  }

  /** A job that failed before it started. */
  fail(kind: CliJob["kind"], error: string): CliJob {
    const now = new Date().toISOString();
    this.job = { kind, state: "failed", startedAt: now, finishedAt: now, url: null, code: null, log: "", error };
    return { ...this.job };
  }

  /** Type a line to the running job (the code a sign-in page shows). False when no job is waiting for one. */
  write(line: string): boolean {
    const input = this.child?.stdin;
    if (this.job?.state !== "running" || !input || input.destroyed || !input.writable) return false;
    input.write(`${line}\n`);
    return true;
  }

  cancel(): CliJob | null {
    this.child?.kill("SIGTERM");
    return this.current();
  }

  shutdown(): void {
    this.child?.kill("SIGTERM");
  }
}
