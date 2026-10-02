// A ChatGPT subscription as a brain (specs/agent-runtimes): the Codex CLI
// signs in with the user's ChatGPT account ("Sign in with ChatGPT"), and the
// `codex` brain then runs on that plan with no API key. From the settings
// screen the hub checks the sign-in (`codex login status`), installs the CLI
// (`npm install -g @openai/codex`), starts the sign-in in the browser or with a
// device code (`codex login [--device-auth]`) and signs out (`codex logout`).
// Orbis never sees the password or the tokens: Codex keeps them in ~/.codex.
import type { CodexAccount as CodexAccountStatus, CliJob } from "@orbis/shared";
import { findExecutable } from "./health.js";
import { ANSI, CliJobs } from "./cli-jobs.js";
import { resolveExecutable } from "./process.js";

export const CODEX_PACKAGE = "@openai/codex";
const STATUS_TIMEOUT_MS = 20_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const LOGIN_TIMEOUT_MS = 15 * 60_000;

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

export class CodexAccount {
  private readonly jobs: CliJobs;

  constructor(private readonly envPath: () => string = () => process.env.PATH ?? "") {
    this.jobs = new CliJobs(envPath, (job) => {
      const found = parseLoginOutput(job.log);
      job.url = job.url ?? found.url;
      job.code = job.code ?? found.code;
    });
  }

  private codex(): string | null {
    return findExecutable(["codex"], this.envPath())?.path ?? null;
  }

  async status(): Promise<CodexAccountStatus> {
    const file = this.codex();
    const job = this.jobs.current();
    if (!file) return { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job };
    const [version, login] = await Promise.all([
      this.jobs.run(file, ["--version"], STATUS_TIMEOUT_MS),
      this.jobs.run(file, ["login", "status"], STATUS_TIMEOUT_MS),
    ]);
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

  /** `npm install -g @openai/codex`: needs Node.js's npm on the hub's machine. */
  install(): CliJob {
    const npm = resolveExecutable("npm", this.envPath());
    if (!npm) return this.jobs.fail("install", "npm is not installed: install Node.js from https://nodejs.org, then press Install again");
    return this.jobs.begin("install", npm, ["install", "-g", `${CODEX_PACKAGE}@latest`], INSTALL_TIMEOUT_MS);
  }

  /** `codex login` opens the browser on this machine; `--device-auth` gives a link and a code for any device. */
  login(device: boolean): CliJob {
    const file = this.codex();
    if (!file) return this.jobs.fail("login", "the Codex CLI is not installed: press Install first");
    return this.jobs.begin("login", file, device ? ["login", "--device-auth"] : ["login"], LOGIN_TIMEOUT_MS);
  }

  cancel(): CliJob | null {
    return this.jobs.cancel();
  }

  async logout(): Promise<CodexAccountStatus> {
    const file = this.codex();
    if (file) await this.jobs.run(file, ["logout"], STATUS_TIMEOUT_MS);
    return this.status();
  }

  shutdown(): void {
    this.jobs.shutdown();
  }
}
