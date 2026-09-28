// specs/agent-runtimes — ChatGPT through the Codex CLI (change
// 0019-chatgpt-codex): the hub installs the CLI with npm, starts the sign-in
// (a device code or the browser), reports the account and signs out, all with
// fake `npm` and `codex` executables; the parsers read what Codex really prints.
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseLoginOutput, parseLoginStatus } from "../../src/brains/codex-account.js";
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

/** A fake Codex CLI: its sign-in state is a file next to it. */
const FAKE_CODEX = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const state = path.join(__dirname, "signed-in");
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("codex-cli 9.9.9"); process.exit(0); }
if (a === "logout") { fs.rmSync(state, { force: true }); console.log("Successfully logged out"); process.exit(0); }
if (a === "login" && b === "status") {
  if (fs.existsSync(state)) { console.log("Logged in using ChatGPT"); process.exit(0); }
  console.log("Not logged in"); process.exit(1);
}
if (a === "login") {
  if (b === "--device-auth") {
    console.log("\\nFollow these steps to sign in with ChatGPT using device code authorization:\\n\\n1. Open this link in your browser and sign in to your account\\n   \\u001b[94mhttps://auth.openai.com/codex/device\\u001b[0m\\n\\n2. Enter this one-time code \\u001b[90m(expires in 15 minutes)\\u001b[0m\\n   \\u001b[94mABCD-12345\\u001b[0m\\n");
  } else {
    console.log("Starting local login server on http://localhost:1455.\\nIf your browser did not open, navigate to this URL to authenticate:\\n\\nhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback\\n");
  }
  setTimeout(() => { fs.writeFileSync(state, "yes"); console.log("Successfully logged in"); process.exit(0); }, 400);
}
`;

/** A fake npm whose global install drops the fake Codex next to it. */
const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2).join(" ");
if (args !== "install -g @openai/codex@latest") { console.error("unexpected: " + args); process.exit(2); }
const target = path.join(__dirname, "codex");
fs.writeFileSync(target, fs.readFileSync(path.join(__dirname, "codex.template"), "utf8"));
fs.chmodSync(target, 0o755);
console.log("added 1 package in 1s");
`;

function fakeBin(): string {
  bin = mkdtempSync(path.join(tmpdir(), "orbis-codex-"));
  writeFileSync(path.join(bin, "codex.template"), FAKE_CODEX);
  writeFileSync(path.join(bin, "npm"), FAKE_NPM);
  chmodSync(path.join(bin, "npm"), 0o755);
  // npm and codex are found here first; node stays on the rest of PATH.
  process.env.PATH = `${bin}${path.delimiter}${(savedPath ?? "")
    .split(path.delimiter)
    .filter((d) => d && !/node_modules/.test(d))
    .join(path.delimiter)}`;
  return bin;
}

const waitJob = async (t: TestHub) => {
  for (let i = 0; i < 100; i++) {
    const account = (await t.api("GET", "/api/v1/runtimes/codex/account")).body;
    if (account.job?.state !== "running") return account;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the job never ended");
};

describe.skipIf(process.platform === "win32")("ChatGPT through the Codex CLI", () => {
  it("installs Codex, signs in with a device code, reports the ChatGPT account and signs out", async () => {
    fakeBin();
    t = await testHub();
    const before = (await t.api("GET", "/api/v1/runtimes/codex/account")).body;
    expect(before).toMatchObject({ installed: false, loggedIn: false, job: null });
    const refused = await t.api("POST", "/api/v1/runtimes/codex/login", {});
    expect(refused.body).toMatchObject({ kind: "login", state: "failed", error: expect.stringContaining("press Install first") });

    const install = await t.api("POST", "/api/v1/runtimes/codex/install");
    expect(install.status).toBe(202);
    expect(install.body).toMatchObject({ kind: "install", state: "running" });
    const installed = await waitJob(t);
    expect(installed).toMatchObject({
      installed: true,
      version: "codex-cli 9.9.9",
      loggedIn: false,
      method: null,
      detail: "Not logged in",
      job: { kind: "install", state: "done" },
    });
    expect(installed.job.log).toContain("added 1 package");

    const login = await t.api("POST", "/api/v1/runtimes/codex/login", { device: true });
    expect(login.status).toBe(202);
    // The link and the code show up while Codex waits for the user.
    let job = login.body;
    for (let i = 0; i < 50 && !job.code; i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await t.api("GET", "/api/v1/runtimes/codex/account")).body.job;
    }
    expect(job).toMatchObject({ kind: "login", url: "https://auth.openai.com/codex/device", code: "ABCD-12345" });
    const signedIn = await waitJob(t);
    expect(signedIn).toMatchObject({ loggedIn: true, method: "chatgpt", detail: "Logged in using ChatGPT", job: { state: "done" } });

    const out = await t.api("POST", "/api/v1/runtimes/codex/logout");
    expect(out.body).toMatchObject({ loggedIn: false, method: null });
  });

  it("gives the browser sign-in link, and a cancelled sign-in says so", async () => {
    fakeBin();
    writeFileSync(path.join(bin!, "codex"), FAKE_CODEX);
    chmodSync(path.join(bin!, "codex"), 0o755);
    t = await testHub();
    await t.api("POST", "/api/v1/runtimes/codex/login", {});
    let job = (await t.api("GET", "/api/v1/runtimes/codex/account")).body.job;
    for (let i = 0; i < 50 && !job.url; i++) {
      await new Promise((r) => setTimeout(r, 20));
      job = (await t.api("GET", "/api/v1/runtimes/codex/account")).body.job;
    }
    expect(job.url).toMatch(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?response_type=code/);
    expect(job.code).toBeNull();
    await t.api("POST", "/api/v1/runtimes/codex/cancel");
    const after = await waitJob(t);
    expect(after.job).toMatchObject({ state: "failed", error: "cancelled" });
    expect(after.loggedIn).toBe(false);
  });
});

describe("reading what Codex prints", () => {
  it("parses the real device and browser sign-in output and the status line", () => {
    const device =
      "Welcome to Codex [v\x1b[90m0.158.0\x1b[0m]\n\nFollow these steps to sign in with ChatGPT using device code authorization:\n\n1. Open this link in your browser and sign in to your account\n   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\n\n2. Enter this one-time code \x1b[90m(expires in 15 minutes)\x1b[0m\n   \x1b[94m30UB-A2XD1\x1b[0m\n";
    expect(parseLoginOutput(device)).toEqual({ url: "https://auth.openai.com/codex/device", code: "30UB-A2XD1" });
    const browser =
      "Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\nhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoamEEZ73f0CkXaXp7hrann&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback&state=x\n\nOn a remote or headless machine? Use `codex login --device-auth` instead.";
    expect(parseLoginOutput(browser)).toEqual({ url: expect.stringMatching(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/), code: null });
    expect(parseLoginStatus("Not logged in\n", 1)).toEqual({ loggedIn: false, method: null });
    expect(parseLoginStatus("Logged in using ChatGPT\n", 0)).toEqual({ loggedIn: true, method: "chatgpt" });
    expect(parseLoginStatus("Logged in using an API key - sk-proj-***ABCDE\n", 0)).toEqual({ loggedIn: true, method: "api-key" });
  });
});
