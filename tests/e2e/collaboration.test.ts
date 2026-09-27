// Collaboration end to end in a real browser: create a group in the dialog,
// @-mention with autocomplete, watch a handoff card and the threaded answer
// (specs/conversations, specs/handoff, specs/web-app).
import { afterAll, beforeAll, describe, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-collab";
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

describe("collaboration in a browser", () => {
  it("creates a group, mentions a member with autocomplete and follows a handoff", async () => {
    hub.botService.create({ name: "Ana", role: "QA", brain: { kind: "mock" } });
    hub.botService.create({ name: "Bob", role: "Engineering", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-ana").waitFor();

    await page.getByRole("button", { name: "+ New group" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Group name").fill("Release");
    await dialog.getByRole("checkbox", { name: /Ana/ }).check();
    await dialog.getByRole("checkbox", { name: /Bob/ }).check();
    await dialog.getByRole("button", { name: "Create group" }).click();
    await page.getByRole("heading", { level: 1, name: "Release" }).waitFor();

    // Type "@b", pick Bob from the list, send: only Bob answers.
    const composer = page.getByRole("textbox", { name: /Message Release/ });
    await composer.pressSequentially("@b");
    await page.getByRole("listbox").getByRole("option", { name: /@bob/ }).waitFor();
    await composer.press("Enter");
    await composer.pressSequentially("status please");
    await composer.press("Enter");
    const log = page.getByRole("log");
    await log.getByText("[Bob] @bob status please", { exact: true }).waitFor({ timeout: 15_000 });

    // Ana hands a task to Bob: the card shows, then Bob's answer threaded under it.
    // (The receiver is written without "@" so the message itself only mentions Ana.)
    await composer.fill(`@ana\n/tool team.handoff {"to":"bob","task":"/reply logs are clean"}`);
    await composer.press("Enter");
    const card = page.getByTestId("handoff-card");
    await card.getByText("@ana handed a task to @bob").waitFor({ timeout: 15_000 });
    await log.getByText("logs are clean", { exact: true }).waitFor({ timeout: 15_000 });
    await card.getByText("Done").waitFor();
  });
});
