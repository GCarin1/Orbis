// The kinds of computer in a real browser (specs/web-app, specs/computer): the
// user gives a bot their own computer — a folder, an explicit consent — the bot
// asks before writing there, the file lands in the user's folder after "Allow
// once", and the settings screen explains the three kinds (change
// 0017-computer-modes).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-computer-modes";
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

describe("computer modes in a browser", () => {
  it("gives a bot the user's own folder with consent, and its write waits for approval", async () => {
    const folder = realpathSync(mkdtempSync(path.join(tmpdir(), "orbis-e2e-host-")));
    dirs.push(folder);
    hub.botService.create({ name: "Hana", role: "Assistant", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-hana").click();

    await page.getByRole("button", { name: "Bot options" }).click();
    await page.getByRole("menuitem", { name: "Bot settings" }).click();
    const panel = page.getByTestId("settings-panel");
    await panel.getByTestId("mode-host").click();
    await panel.getByLabel("Folder it works in").fill(folder);
    await panel.getByRole("button", { name: "Save" }).click();
    await panel.getByText(/Confirm that this bot may use your computer/).waitFor();
    await panel.getByLabel(/I understand this bot will be able to/).check();
    await panel.getByRole("button", { name: "Save" }).click();
    await panel.getByText("Saved.").waitFor();
    expect(hub.botService.get("hana").computer).toMatchObject({ provider: "host", hostDir: folder });

    // The panel names the computer; a write on the user's machine asks first.
    await page.getByRole("button", { name: "Details" }).click();
    await page.getByTestId("computer-mode").getByText(`My computer · ${folder}`).waitFor();
    const composer = page.getByRole("textbox", { name: /Message Hana/ });
    await composer.fill(`/tool computer.write_file ${JSON.stringify({ path: "hello.txt", content: "hi from Orbis" })}`);
    await composer.press("Enter");
    const card = page.getByRole("log").getByTestId("approval-card").first();
    await card.waitFor({ timeout: 15_000 });
    expect(existsSync(path.join(folder, "hello.txt"))).toBe(false);
    await card.getByRole("button", { name: "Allow once" }).click();
    await expect.poll(() => existsSync(path.join(folder, "hello.txt")), { timeout: 15_000 }).toBe(true);
    expect(readFileSync(path.join(folder, "hello.txt"), "utf8")).toBe("hi from Orbis");

    // Settings → Computers explains the three kinds.
    await page.getByRole("button", { name: /Settings/ }).first().click();
    await page.getByRole("tab", { name: "Computers" }).click();
    const tab = page.getByTestId("computers-settings");
    await tab.getByTestId("computers-host").getByText(/Default folder:/).waitFor();
    expect(await tab.getByTestId("computers-docker").textContent()).toMatch(/Container \(Docker\)/);
  });
});
