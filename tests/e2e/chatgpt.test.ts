// ChatGPT through the Codex CLI in a real browser (specs/web-app,
// specs/agent-runtimes): Settings → ChatGPT installs Codex (a fake npm), starts
// the sign-in with a code (a fake codex), shows the code and the OpenAI page,
// and then the connected account (change 0019-chatgpt-codex).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-chatgpt";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
const dirs: string[] = [];
const savedPath = process.env.PATH;

const FAKE_CODEX = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const state = path.join(__dirname, "signed-in");
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("codex-cli 9.9.9"); process.exit(0); }
if (a === "login" && b === "status") { if (fs.existsSync(state)) { console.log("Logged in using ChatGPT"); process.exit(0); } console.log("Not logged in"); process.exit(1); }
if (a === "login" && b === "--device-auth") {
  console.log("1. Open this link in your browser and sign in to your account\\n   https://auth.openai.com/codex/device\\n\\n2. Enter this one-time code (expires in 15 minutes)\\n   E2E0-CODE1");
  setTimeout(() => { fs.writeFileSync(state, "yes"); process.exit(0); }, 2500);
}
`;
const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
fs.writeFileSync(path.join(__dirname, "codex"), fs.readFileSync(path.join(__dirname, "codex.template"), "utf8"));
fs.chmodSync(path.join(__dirname, "codex"), 0o755);
console.log("added 1 package");
`;

beforeAll(async () => {
  const bin = mkdtempSync(path.join(tmpdir(), "orbis-e2e-codex-"));
  writeFileSync(path.join(bin, "codex.template"), FAKE_CODEX);
  writeFileSync(path.join(bin, "npm"), FAKE_NPM);
  chmodSync(path.join(bin, "npm"), 0o755);
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(bin, outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  // The hub finds npm and codex on PATH: the fakes come first.
  process.env.PATH = `${bin}${path.delimiter}${(savedPath ?? "").split(path.delimiter).filter((d) => d && !/node_modules/.test(d)).join(path.delimiter)}`;
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  process.env.PATH = savedPath;
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("ChatGPT in a browser", () => {
  it("installs Codex, signs in with a code and shows the connected ChatGPT account", async () => {
    const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByRole("button", { name: /Settings/ }).first().click();
    const card = page.getByTestId("chatgpt-card");
    await card.getByText("Codex not installed").waitFor();

    await card.getByRole("button", { name: "Install Codex" }).click();
    await card.getByText("✓ codex-cli 9.9.9").waitFor({ timeout: 15_000 });

    await card.getByRole("button", { name: "Sign in with a code (another device)" }).click();
    const login = card.getByTestId("chatgpt-login");
    await login.getByText("E2E0-CODE1").waitFor({ timeout: 10_000 });
    expect(await login.getByRole("link", { name: "Open the OpenAI page" }).getAttribute("href")).toBe("https://auth.openai.com/codex/device");

    await card.getByText("Connected to ChatGPT").waitFor({ timeout: 15_000 });
    expect(await card.textContent()).toContain("Logged in using ChatGPT");
  });
});
