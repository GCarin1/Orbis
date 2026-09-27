// Approvals end to end in a real browser: a bot asks, the card appears, the
// user allows it, the action runs (specs/approvals, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-approvals";
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

describe("approvals in a browser", () => {
  it("shows the approval card and runs the tool after Allow once", async () => {
    hub.botService.create({
      name: "Ana",
      role: "QA",
      brain: { kind: "mock" },
      policy: { rules: [{ tool: "conversation.post", decision: "ask" }], grants: [] },
    });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").click();

    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.fill('/tool conversation.post {"text":"Checklist: 12/12 passed"}');
    await composer.press("Enter");

    const card = page.getByTestId("approval-card");
    await card.getByText("Ana wants to use conversation.post").waitFor();
    // The inbox lists it too.
    await page.getByTestId("inbox-item").waitFor();
    await card.getByRole("button", { name: "Allow once" }).click();

    await page.getByRole("log").getByText("Checklist: 12/12 passed", { exact: true }).waitFor({ timeout: 15_000 });
    await card.getByText("Approved").waitFor();
    expect(await page.getByTestId("inbox-item").count()).toBe(0);
  });
});
