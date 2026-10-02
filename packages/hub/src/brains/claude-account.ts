// Claude Code's sign-in from the settings screen (specs/agent-runtimes): the
// hub reads the account (`claude auth status`) and starts the sign-in
// (`claude auth login`), which opens the browser on this machine, or prints a
// page and waits for the code that page shows. Orbis never sees the password
// or the tokens: Claude Code keeps them in its own folder.
import type { ClaudeAccount as ClaudeAccountStatus, CliJob } from "@orbis/shared";
import { ANSI, CliJobs } from "./cli-jobs.js";
import { findExecutable } from "./health.js";

const STATUS_TIMEOUT_MS = 20_000;
const LOGIN_TIMEOUT_MS = 15 * 60_000;

/** What `claude auth status` says (JSON by default): signed in or not, and how. */
export function parseAuthStatus(output: string, exitCode: number | null): { loggedIn: boolean; method: string | null } {
  const text = output.replace(ANSI, "");
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (json) {
    try {
      const status = JSON.parse(json) as { loggedIn?: unknown; authMethod?: unknown };
      return { loggedIn: status.loggedIn === true, method: typeof status.authMethod === "string" ? status.authMethod : null };
    } catch {
      /* not JSON: read it as text */
    }
  }
  return { loggedIn: exitCode === 0 && !/not logged in|not signed in|unknown command/i.test(text), method: null };
}

/** The sign-in page `claude auth login` prints ("If the browser didn't open, visit: <url>"). */
export function parseSignInUrl(output: string): string | null {
  const urls = output.replace(ANSI, "").match(/https:\/\/[^\s"'<>]+/g) ?? [];
  return urls.find((u) => /oauth\/authorize/.test(u)) ?? urls[0] ?? null;
}

export class ClaudeAccount {
  private readonly jobs: CliJobs;

  constructor(private readonly envPath: () => string = () => process.env.PATH ?? "") {
    this.jobs = new CliJobs(envPath, (job) => {
      job.url = job.url ?? parseSignInUrl(job.log);
    });
  }

  private claude(): string | null {
    return findExecutable(["claude"], this.envPath())?.path ?? null;
  }

  async status(): Promise<ClaudeAccountStatus> {
    const file = this.claude();
    const job = this.jobs.current();
    if (!file) return { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job };
    const [version, auth] = await Promise.all([
      this.jobs.run(file, ["--version"], STATUS_TIMEOUT_MS),
      this.jobs.run(file, ["auth", "status"], STATUS_TIMEOUT_MS),
    ]);
    const line = (text: string) =>
      text
        .replace(ANSI, "")
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) ?? null;
    return { installed: true, version: line(version.output), path: file, ...parseAuthStatus(auth.output, auth.code), detail: null, job };
  }

  /** `claude auth login`: the browser opens on this machine; the page it prints works from any device. */
  login(): CliJob {
    const file = this.claude();
    if (!file) return this.jobs.fail("login", "Claude Code is not installed: run npm i -g @anthropic-ai/claude-code, then press Sign in again");
    return this.jobs.begin("login", file, ["auth", "login", "--claudeai"], LOGIN_TIMEOUT_MS, true);
  }

  /** The code the sign-in page shows, typed to the waiting `claude auth login`. */
  submitCode(code: string): boolean {
    return this.jobs.write(code.trim());
  }

  cancel(): CliJob | null {
    return this.jobs.cancel();
  }

  shutdown(): void {
    this.jobs.shutdown();
  }
}
