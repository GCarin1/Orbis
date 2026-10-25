// Getting around on a phone (changes 0087-phone-back-button, 0089-phone-tab-bar): every full screen leads back to
// the conversations (specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-phone-nav";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
const dirs: string[] = [];

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function phone(): Promise<Page> {
  const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(`${url}/#token=${TOKEN}`);
  await page.getByTestId("bot-ana").waitFor();
  return page;
}

describe("getting around on a phone", () => {
  it("leads back to the conversations from every full screen", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" } });
    const page = await phone();
    for (const screen of ["🖼 Library", "📘 Skills", "🛡 Squads", "📊 Usage", "⚙ Settings"]) {
      const button = page.getByRole("button", { name: screen, exact: true });
      if (!(await button.count())) await page.getByRole("button", { name: "More", exact: true }).click();
      await button.first().click();
      await page.getByRole("button", { name: "Back" }).first().click();
      await page.getByTestId("bot-ana").waitFor({ state: "visible" });
    }
  });

  it("goes everywhere from the tab bar, the rest under More, and hides it inside a conversation", async () => {
    const page = await phone();
    const tabs = page.getByRole("navigation", { name: "Navigation" });
    expect(await tabs.getByRole("button").allTextContents()).toEqual(["Conversations", "Library", "Team", "More"]);
    // The sidebar's seven rows are gone from the phone's list.
    expect(await page.getByRole("navigation", { name: "Orbis" }).isVisible()).toBe(false);
    await tabs.getByRole("button", { name: "🛡 Squads" }).click();
    await page.getByRole("heading", { level: 1, name: "Squads" }).waitFor();
    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    expect(await sheet.getByRole("button").allTextContents()).toEqual(expect.arrayContaining(["Skills", "Hiring", "Usage", "Settings"]));
    await sheet.getByRole("button", { name: "📊 Usage" }).click();
    await page.getByRole("heading", { level: 1, name: /Usage/ }).waitFor();
    await tabs.getByRole("button", { name: "Conversations" }).click();
    await page.getByTestId("bot-ana").click();
    await page.getByRole("textbox").first().waitFor();
    expect(await tabs.count()).toBe(0);
  });
});
