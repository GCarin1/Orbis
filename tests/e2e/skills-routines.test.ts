// Skills and routines end to end in a real browser: write a skill in the skills
// screen, invoke it with `/` autocomplete, create a routine, test it, enable it
// (specs/skills, specs/routines, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-skills";
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

describe("skills and routines in a browser", () => {
  it("writes a skill, invokes it with / autocomplete, and creates, tests and enables a routine", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").waitFor();

    // Skills screen: save a new account skill.
    await page.getByRole("button", { name: /Skills/ }).first().click();
    const screen = page.getByTestId("skills-screen");
    await screen.getByLabel("SKILL.md").fill("---\nname: smoke\ndescription: Run the smoke checklist\n---\n1. Open the app.\n2. Log in.\n");
    await screen.getByRole("button", { name: "Save" }).click();
    await screen.getByText("Saved.").waitFor();
    await screen.getByRole("button", { name: /\/smoke/ }).waitFor();

    // Back to Ana: `/sm` offers the skill; Enter completes it; the run carries the skill.
    await page.getByTestId("bot-ana").click();
    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.pressSequentially("/sm");
    await page.getByRole("listbox", { name: "Skills" }).getByRole("option", { name: /\/smoke/ }).waitFor();
    await composer.press("Enter");
    await composer.pressSequentially("on staging");
    await composer.press("Enter");
    await page.getByRole("log").getByText("[Ana] on staging", { exact: true }).waitFor({ timeout: 15_000 });
    const ana = hub.botService.get("ana");
    expect(hub.repos.runs.list({ botId: ana.id })[0]).toMatchObject({ skill: "smoke" });

    // Routines panel: create, test, enable.
    await page.getByRole("button", { name: /Routines/ }).click();
    const panel = page.getByTestId("routines-panel");
    await panel.getByLabel("Name").fill("Nightly smoke");
    await panel.getByLabel("Schedule (cron)", { exact: true }).last().fill("0 2 * * *");
    await panel.getByLabel("Timezone").fill("America/Sao_Paulo");
    await panel.getByLabel("Instruction").fill("/reply smoke passed");
    await panel.getByRole("button", { name: "Create routine" }).click();
    const routine = panel.locator("li.routine").first();
    await routine.getByText("Nightly smoke").waitFor();
    await routine.getByText("Disabled").waitFor();
    await routine.getByRole("button", { name: "Test" }).click();
    await routine.getByText(/Last: done \(test\)/).waitFor({ timeout: 15_000 });
    await routine.getByRole("button", { name: "Enable" }).click();
    await routine.getByText("Enabled").waitFor();
    await routine.getByText(/Next: /).waitFor();

    // Routine cards in the conversation.
    const cards = page.getByTestId("routine-card");
    await cards.filter({ hasText: "Nightly smoke" }).first().waitFor();
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
  });
});
