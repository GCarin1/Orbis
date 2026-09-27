// A bot's computer end to end in a real browser: the bot browses a page, the
// user opens the computer panel and sees the page, takes over and hands back
// (specs/computer, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-computer";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let site: Server;
let siteUrl: string;
let browser: Browser;
const dirs: string[] = [];

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  url = await hub.listen();
  site = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<title>Status page</title><h1 style='font-size:64px'>All systems green</h1>");
  });
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  await new Promise<void>((r) => site.close(() => r()));
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a bot's computer in the web app", () => {
  it("shows the page the bot opened, and takes over and hands back", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").click();

    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.fill(`/tool browser.open {"url":"${siteUrl}"}`);
    await composer.press("Enter");
    await page.getByRole("log").getByText(/All systems green/).first().waitFor({ timeout: 20_000 });

    await page.getByRole("button", { name: /Computer/ }).click();
    const panel = page.getByTestId("computer-panel");
    await panel.getByText("Running").waitFor();
    const shot = panel.getByTestId("computer-screenshot");
    await shot.waitFor({ timeout: 10_000 });
    expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1280);

    await panel.getByRole("button", { name: "Take over" }).click();
    await panel.getByRole("status").getByText(/You are in control/).waitFor();
    expect(hub.computer.holdsTakeover(hub.botService.get("ana").id)).toBe(true);
    await panel.getByRole("button", { name: "Hand back" }).click();
    await panel.getByRole("button", { name: "Take over" }).waitFor();
    expect(hub.computer.holdsTakeover(hub.botService.get("ana").id)).toBe(false);

    await panel.getByRole("button", { name: "Full screen" }).click();
    expect(await panel.evaluate((el) => el.classList.contains("fullscreen"))).toBe(true);
  });
});
