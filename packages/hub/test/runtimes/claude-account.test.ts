// specs/agent-runtimes — Claude Code's sign-in from the settings screen (change
// 0033): the hub reads the account (`claude auth status`), starts the sign-in
// (`claude auth login`), hands it the code the sign-in page shows, and tells a
// failed run that its login needs renewing. All with a fake `claude`.
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAuthStatus, parseSignInUrl } from "../../src/brains/claude-account.js";
import { mapClaudeMessage, withSignInHint } from "../../src/brains/claude-code.js";
import { testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let bin: string | null = null;
const savedPath = process.env.PATH;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  process.env.PATH = savedPath;
  if (bin) rmSync(bin, { recursive: true, force: true });
  bin = null;
});

/** A fake Claude Code: its sign-in is a file next to it; `auth login` waits for the code on stdin like the real one. */
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const state = path.join(__dirname, "signed-in");
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (a === "auth" && b === "status") {
  const on = fs.existsSync(state);
  console.log(JSON.stringify({ loggedIn: on, authMethod: on ? "oauth_token" : "none", apiProvider: "firstParty" }));
  process.exit(on ? 0 : 1);
}
if (a === "auth" && b === "login") {
  console.log("Opening browser to sign in…");
  console.log("If the browser didn't open, visit: https://sign-in.example.com/oauth/authorize?code=true&client_id=made-up&state=xyz");
  process.stdout.write("Paste code here if prompted > ");
  let input = "";
  process.stdin.on("data", (d) => {
    input += d;
    if (!input.includes("\\n")) return;
    if (input.trim() === "good-code") { fs.writeFileSync(state, "yes"); console.log("\\nLogin successful."); process.exit(0); }
    console.error("\\nInvalid code."); process.exit(1);
  });
  setTimeout(() => process.exit(2), 20000);
}
`;

function fakeBin(): void {
  bin = mkdtempSync(path.join(tmpdir(), "orbis-claude-"));
  writeFileSync(path.join(bin, "claude"), FAKE_CLAUDE);
  chmodSync(path.join(bin, "claude"), 0o755);
  process.env.PATH = `${bin}${path.delimiter}${(savedPath ?? "")
    .split(path.delimiter)
    .filter((d) => d && !/node_modules/.test(d))
    .join(path.delimiter)}`;
}

const account = async (t: TestHub) => (await t.api("GET", "/api/v1/runtimes/claude/account")).body;
const waitJob = async (t: TestHub, until: (a: { job: { state: string; url: string | null } | null }) => boolean) => {
  for (let i = 0; i < 100; i++) {
    const a = await account(t);
    if (until(a)) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the job never got there");
};

describe("what `claude auth` prints", () => {
  it("reads the account from the JSON, or from the text of an older CLI", () => {
    expect(parseAuthStatus('{"loggedIn": true, "authMethod": "oauth_token", "apiProvider": "firstParty"}', 0)).toEqual({
      loggedIn: true,
      method: "oauth_token",
    });
    expect(parseAuthStatus('{"loggedIn": false, "authMethod": "none"}', 1)).toEqual({ loggedIn: false, method: "none" });
    expect(parseAuthStatus("error: unknown command 'auth'", 1)).toEqual({ loggedIn: false, method: null });
    expect(parseAuthStatus("Not logged in", 0)).toEqual({ loggedIn: false, method: null });
  });

  it("finds the sign-in page among what `auth login` prints", () => {
    const out =
      "\u001b[?25lOpening browser to sign in…\nIf the browser didn't open, visit: https://sign-in.example.com/oauth/authorize?code=true&state=xyz\nPaste code here if prompted > ";
    expect(parseSignInUrl(out)).toBe("https://sign-in.example.com/oauth/authorize?code=true&state=xyz");
    expect(parseSignInUrl("nothing yet")).toBeNull();
  });
});

describe("a run that fails because Claude Code's login expired", () => {
  it("says how to sign in again, once", () => {
    const expired = "Failed to authenticate: OAuth session expired and could not be refreshed";
    const hinted = withSignInHint(expired);
    expect(hinted).toContain(expired);
    expect(hinted).toContain("Settings → Brains → Claude Code → Sign in");
    expect(hinted).toContain("claude auth login");
    expect(withSignInHint(hinted)).toBe(hinted);
    expect(withSignInHint("Claude Code ended without a result")).toBe("Claude Code ended without a result");
    const events = mapClaudeMessage(
      { type: "result", is_error: true, subtype: "success", result: expired, usage: {} },
      { sessionId: null, toolNames: new Map(), finished: false },
    );
    expect(events.find((e) => e.type === "run.failed")).toMatchObject({ error: expect.stringContaining("claude auth login") });
  });
});

describe.skipIf(process.platform === "win32")("signing in to Claude Code from the settings screen", () => {
  it("reports the account, starts the sign-in, takes the code from the page and ends signed in", async () => {
    fakeBin();
    t = await testHub();
    expect(await account(t)).toMatchObject({ installed: true, version: "9.9.9 (Claude Code)", loggedIn: false, method: "none", job: null });

    // A code before any sign-in has nothing to go to.
    const early = await t.api("POST", "/api/v1/runtimes/claude/code", { code: "good-code" });
    expect(early.status).toBe(409);

    const started = await t.api("POST", "/api/v1/runtimes/claude/login");
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ kind: "login", state: "running" });
    const waiting = await waitJob(t, (a) => a.job?.url != null);
    expect(waiting.job).toMatchObject({ state: "running", url: "https://sign-in.example.com/oauth/authorize?code=true&client_id=made-up&state=xyz" });

    const sent = await t.api("POST", "/api/v1/runtimes/claude/code", { code: "  good-code  " });
    expect(sent.body).toEqual({ sent: true });
    const done = await waitJob(t, (a) => a.job?.state !== "running");
    expect(done).toMatchObject({ loggedIn: true, method: "oauth_token", job: { kind: "login", state: "done" } });
  });

  it("fails the sign-in with the CLI's words when the code is wrong, and can be cancelled", async () => {
    fakeBin();
    t = await testHub();
    await t.api("POST", "/api/v1/runtimes/claude/login");
    await waitJob(t, (a) => a.job?.url != null);
    await t.api("POST", "/api/v1/runtimes/claude/code", { code: "wrong" });
    const failed = await waitJob(t, (a) => a.job?.state !== "running");
    expect(failed).toMatchObject({ loggedIn: false, job: { state: "failed", error: expect.stringContaining("Invalid code") } });

    await t.api("POST", "/api/v1/runtimes/claude/login");
    await waitJob(t, (a) => a.job?.state === "running");
    await t.api("POST", "/api/v1/runtimes/claude/cancel");
    expect((await waitJob(t, (a) => a.job?.state !== "running")).job).toMatchObject({ state: "failed", error: "cancelled" });
  });

  it("says Claude Code is missing when it is not on PATH", async () => {
    process.env.PATH = (savedPath ?? "")
      .split(path.delimiter)
      .filter((d) => d && !/node_modules/.test(d) && !/node/.test(d))
      .join(path.delimiter);
    t = await testHub();
    expect(await account(t)).toMatchObject({ installed: false, loggedIn: false });
    const refused = await t.api("POST", "/api/v1/runtimes/claude/login");
    expect(refused.body).toMatchObject({ state: "failed", error: expect.stringContaining("not installed") });
  });
});
