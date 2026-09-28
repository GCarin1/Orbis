// A ChatGPT subscription as a brain (specs/agent-runtimes): the Codex CLI
// signs in with the user's ChatGPT account ("Sign in with ChatGPT"), and the
// `codex` brain then runs on that plan with no API key. From the settings
// screen the hub checks the sign-in (`codex login status`), installs the CLI
// (`npm install -g @openai/codex`), starts the sign-in in the browser or with a
// device code (`codex login [--device-auth]`) and signs out (`codex logout`).
// Orbis never sees the password or the tokens: Codex keeps them in ~/.codex.
import { spawn, type ChildProcess } from "node:child_process";
import type { CodexAccount as CodexAccountStatus, CliJob } from "@orbis/shared";
import { findExecutable } from "./health.js";
import { harnessEnv, launchCommand, resolveExecutable } from "./process.js";

export const CODEX_PACKAGE = "@openai/codex";
const STATUS_TIMEOUT_MS = 20_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const LOGIN_TIMEOUT_MS = 15 * 60_000;
const LOG_CHARS = 6_000;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** What `codex login status` says: signed in with ChatGPT, with an API key, or not at all. */
export function parseLoginStatus(output: string, exitCode: number | null): { loggedIn: boolean; method: CodexAccountStatus["method"] } {
  const text = output.replace(ANSI, "");
  if (exitCode !== 0 || /not logged in/i.test(text)) return { loggedIn: false, method: null };
  if (/chatgpt/i.test(text)) return { loggedIn: true, method: "chatgpt" };
  if (/api key/i.test(text)) return { loggedIn: true, method: "api-key" };
  return { loggedIn: true, method: null };
}

/** The sign-in link and, for a device login, the one-time code, from what `codex login` prints. */
export function parseLoginOutput(output: string): { url: string | null; code: string | null } {
  const text = output.replace(ANSI, "");
  const urls = text.match(/https:\/\/[^\s"'<>]+/g) ?? [];
  const url = urls.find((u) => /auth\.openai\.com/.test(u)) ?? urls[0] ?? null;
  const code = /\b([A-Z0-9]{4}-[A-Z0-9]{4,8})\b/.exec(text)?.[1] ?? null;
  return { url, code };
}

interface RunResult {
  code: number | null;
  output: string;
}

export class CodexAccount {
  private job: CliJob | null = null;
  private child: ChildProcess | null = null;

  constructor(private readonly envPath: () => string = () => process.env.PATH ?? "") {}

  private codex(): string | null {
    return findExecutable(["codex"], this.envPath())?.path ?? null;
  }

  private start(file: string, args: string[]): ChildProcess {
    const launch = launchCommand(file, args);
    return spawn(launch.command, launch.args, {
      env: harnessEnv({ PATH: this.envPath(), NO_COLOR: "1" }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  private run(file: string, args: string[], timeoutMs: number): Promise<RunResult> {
    return new Promise((resolve) => {
      let output = "";
      let child: ChildProcess;
      try {
        child = this.start(file, args);
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

  async status(): Promise<CodexAccountStatus> {
    const file = this.codex();
    const job = this.job ? { ...this.job } : null;
    if (!file) return { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job };
    const [version, login] = await Promise.all([this.run(file, ["--version"], STATUS_TIMEOUT_MS), this.run(file, ["login", "status"], STATUS_TIMEOUT_MS)]);
    const parsed = parseLoginStatus(login.output, login.code);
    const detail =
      login.output
        .replace(ANSI, "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^WARNING:/.test(l))
        .at(-1) ?? null;
    return {
      installed: true,
      version:
        version.output
          .replace(ANSI, "")
          .split("\n")
          .map((l) => l.trim())
          .find(Boolean) ?? null,
      path: file,
      ...parsed,
      detail,
      job,
    };
  }

  private begin(kind: CliJob["kind"], file: string, args: string[], timeoutMs: number): CliJob {
    if (this.job?.state === "running") return { ...this.job };
    const job: CliJob = { kind, state: "running", startedAt: new Date().toISOString(), finishedAt: null, url: null, code: null, log: "", error: null };
    this.job = job;
    let child: ChildProcess;
    try {
      child = this.start(file, args);
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
      if (kind === "login") {
        const found = parseLoginOutput(job.log);
        job.url = job.url ?? found.url;
        job.code = job.code ?? found.code;
      }
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

  /** `npm install -g @openai/codex`: needs Node.js's npm on the hub's machine. */
  install(): CliJob {
    const npm = resolveExecutable("npm", this.envPath());
    if (!npm) return this.fail("install", "npm is not installed: install Node.js from https://nodejs.org, then press Install again");
    return this.begin("install", npm, ["install", "-g", `${CODEX_PACKAGE}@latest`], INSTALL_TIMEOUT_MS);
  }

  /** `codex login` opens the browser on this machine; `--device-auth` gives a link and a code for any device. */
  login(device: boolean): CliJob {
    const file = this.codex();
    if (!file) return this.fail("login", "the Codex CLI is not installed: press Install first");
    return this.begin("login", file, device ? ["login", "--device-auth"] : ["login"], LOGIN_TIMEOUT_MS);
  }

  cancel(): CliJob | null {
    this.child?.kill("SIGTERM");
    return this.job ? { ...this.job } : null;
  }

  async logout(): Promise<CodexAccountStatus> {
    const file = this.codex();
    if (file) await this.run(file, ["logout"], STATUS_TIMEOUT_MS);
    return this.status();
  }

  private fail(kind: CliJob["kind"], error: string): CliJob {
    const now = new Date().toISOString();
    this.job = { kind, state: "failed", startedAt: now, finishedAt: now, url: null, code: null, log: "", error };
    return { ...this.job };
  }

  shutdown(): void {
    this.child?.kill("SIGTERM");
  }
}
