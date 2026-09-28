// The walking skeleton, end to end in a real browser (specs/web-app criterion 5):
// the web app is built, served by a real hub, and a user creates a bot, sends
// it a message and sees the reply appear.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-token";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
const dirs: string[] = [];

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    logLevel: "error",
    build: { outDir, emptyOutDir: true, sourcemap: false },
  });
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  url = await hub.listen();
  // ORBIS_BROWSER_EXECUTABLE points at a Chromium when Playwright's own is not installed
  // (npx playwright-core install chromium installs the matching one).
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("walking skeleton in a browser", () => {
  it("creates a bot in the UI, sends it a message and shows the reply (web-app criterion 5)", async () => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto(`${url}/#token=${TOKEN}`);

    // The token handed over in the fragment is stored and removed from the address bar.
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "+ New bot" }).click();
    expect(page.url()).not.toContain("token=");
    await page.getByLabel("Name").fill("Ana");
    await page.getByLabel("Role").fill("QA");
    await page.getByRole("radiogroup", { name: "Shape" }).getByRole("radio", { name: "Cloud" }).click();
    await page.getByLabel("Brain").selectOption("mock");
    await page.getByRole("button", { name: "Create bot" }).click();

    // The new bot is in the sidebar with the face it was given, and its conversation is open.
    await expect(page.getByTestId("bot-ana").waitFor()).resolves.toBeUndefined();
    expect(await page.getByTestId("bot-ana").locator("svg.face").getAttribute("class")).toContain("face-cloud");
    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.fill("hello from the browser");
    await composer.press("Enter");

    await page.getByRole("log").getByText("[Ana] hello from the browser").waitFor({ timeout: 15_000 });
    // The roster shows it as the bot's last message too.
    await page.getByTestId("bot-ana").getByText("[Ana] hello from the browser").waitFor();
    await page.getByRole("button", { name: /Show \d+ steps/ }).first().waitFor();

    // The same bot and reply are visible through the API.
    const bots = await (await fetch(`${url}/api/v1/bots`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(bots).toEqual([expect.objectContaining({ name: "Ana", role: "QA", brain: { kind: "mock" } })]);
    await context.close();
  });

  it("serves the app shell for client-side routes and keeps API 404s as JSON", async () => {
    const shell = await fetch(`${url}/some/deep/link`);
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain('<div id="root">');
    const api = await fetch(`${url}/api/v1/nope`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(api.status).toBe(404);
    expect((await api.json()).error.code).toBe("not_found");
  });
});
