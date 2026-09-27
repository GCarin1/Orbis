// Secrets end to end in a real browser: a bot asks for a secret, the user types
// it into the masked card, the bot uses the placeholder, and the value shows up
// nowhere on the page (specs/secrets, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-secrets";
const VALUE = "sk_live_e2e_value_123";
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

describe("secrets in a browser", () => {
  it("asks, stores through the masked card, uses the placeholder, and never shows the value", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" }, policy: { rules: [{ tool: "computer.shell", decision: "allow" }], grants: [] } });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").click();

    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.fill('/tool secret.request {"name":"STRIPE_KEY","reason":"check the payment webhook"}\n/tool computer.shell {"command":"printf %s {{secret:STRIPE_KEY}} > key.txt; echo using {{secret:STRIPE_KEY}}"}');
    await composer.press("Enter");

    const card = page.getByTestId("secret-card");
    await card.getByText("Ana asks for the secret STRIPE_KEY").waitFor({ timeout: 15_000 });
    await card.getByLabel("value (hidden)").fill(VALUE);
    await card.getByRole("button", { name: "Store in the vault" }).click();
    await card.getByText("Stored").waitFor();
    await page.getByRole("log").getByText(/using ••••/).first().waitFor({ timeout: 15_000 });

    const ana = hub.botService.get("ana");
    expect(readFileSync(path.join(hub.computer.workspaceDir(ana.id), "key.txt"), "utf8")).toBe(VALUE);
    // Expand the run's steps too: the value is on no part of the page.
    for (const toggle of await page.getByRole("button", { name: /Show \d+ steps/ }).all()) await toggle.click();
    expect(await page.content()).not.toContain(VALUE);
  });
});
