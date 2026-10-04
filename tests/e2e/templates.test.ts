// Bot settings and templates end to end in a real browser: edit a bot, export
// it as a template file, import that file as a new bot (specs/templates, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-templates";
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

describe("bot settings and templates in a browser", () => {
  it("edits a bot, exports it as a template and imports the file as a new bot", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" } });
    const context = await browser.newContext({ locale: "en-US", acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").click();

    await page.getByRole("button", { name: "Bot options" }).click();
    await page.getByRole("menuitem", { name: "Bot settings" }).click();
    const panel = page.getByTestId("settings-panel");
    await panel.getByLabel("Role").fill("Release QA");
    await panel.getByLabel("Description and durable rules").fill("You check every release. Never send anything without my approval.");
    await panel.getByRole("button", { name: "+ Add rule" }).click();
    await panel.getByTestId("policy-rule").last().getByLabel("Tool").fill("http.fetch");
    await panel.getByLabel(/Monthly spend cap/).fill("15");
    await panel.getByRole("button", { name: "Save" }).click();
    await panel.getByRole("status").getByText("Saved.").waitFor();
    expect(hub.botService.get("ana")).toMatchObject({ role: "Release QA", spendCapUsd: 15, policy: { rules: [{ tool: "http.fetch", decision: "ask" }] } });

    const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Export template" }).click()]);
    expect(download.suggestedFilename()).toBe("ana.orbis.yaml");
    const file = path.join(dirs[1]!, "ana.orbis.yaml");
    await download.saveAs(file);
    expect(readFileSync(file, "utf8")).toContain("kind: BotTemplate");

    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "+ New bot" }).click();
    await page.getByLabel("Or import a template (.yaml)").setInputFiles(file);
    await page.getByRole("heading", { level: 1, name: /Ana @ana-2/ }).waitFor();
    expect(hub.botService.get("ana-2")).toMatchObject({ role: "Release QA", spendCapUsd: 15 });
  });
});
