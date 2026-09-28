// The team end to end in a real browser: the user asks the chief, the chief
// delegates to its reports, their answers show as "Messages from …", the chief
// reports back on its own, another bot's message lights its unread dot, and
// the bot panel shows the team (specs/web-app, specs/handoff, specs/bots).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-team";
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

const handoff = (args: Record<string, unknown>) => `/tool team.handoff ${JSON.stringify(args)}`;

describe("a team in a browser", () => {
  it("delegates from the chief, shows who spoke, reports back on its own and marks other conversations unread", async () => {
    const chief = hub.botService.create({ name: "Chief", role: "Chief of Staff", brain: { kind: "mock" }, avatarShape: "orb", avatarColor: "#8b5cf6" });
    hub.botService.create({ name: "Dana", role: "Designer", brain: { kind: "mock" }, reportsTo: chief.id, avatarShape: "pill" });
    hub.botService.create({ name: "Quinn", role: "QA", brain: { kind: "mock" }, reportsTo: chief.id, avatarShape: "square" });
    const inbox = hub.botService.create({ name: "Inbox", role: "Inbox Triage", brain: { kind: "mock" } });

    const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-chief").click();

    // The panel shows the chief's team; its reports are one click away.
    const panel = page.getByTestId("bot-panel");
    await panel.getByText("Dana", { exact: true }).waitFor();
    await panel.getByText("Quinn", { exact: true }).waitFor();

    const composer = page.getByRole("textbox", { name: /Message Chief/ });
    await composer.fill(
      [handoff({ to: "@designer", task: "/reply Banner ready: 3 variants" }), handoff({ to: "@qa", task: "/reply Checkout tested: 2 bugs" }), "ship the launch page"].join("\n"),
    );
    await composer.press("Enter");

    const log = page.getByRole("log");
    await log.getByTestId("handoff-card").nth(1).waitFor();
    // Colleagues speaking in the chief's own conversation are introduced by name.
    const from = log.getByTestId("messages-from").first();
    await from.waitFor({ timeout: 15_000 });
    expect(await from.textContent()).toMatch(/Messages from (Dana|Quinn)/);
    await log.getByText("Banner ready: 3 variants", { exact: true }).waitFor();
    await log.getByText("Checkout tested: 2 bugs", { exact: true }).waitFor();
    // Once both ended, the chief comes back on its own with the outcome.
    await log.getByText(/All 2 tasks you handed off have ended/).waitFor({ timeout: 15_000 });

    // A message in another bot's conversation lights its unread dot.
    await expect(page.getByTestId("bot-inbox").getByLabel("unread").count()).resolves.toBe(0);
    const inboxConv = hub.conversationService.directFor(inbox.id);
    hub.conversationService.postUserMessage(inboxConv.id, { text: "/reply Inbox at zero" });
    await page.getByTestId("bot-inbox").getByLabel("unread").waitFor({ timeout: 15_000 });
    await page.getByTestId("bot-inbox").click();
    await page.getByRole("heading", { level: 1, name: /Inbox @inbox/ }).waitFor();
    await expect(page.getByTestId("bot-inbox").getByLabel("unread").count()).resolves.toBe(0);

    // From Dana's panel, her manager is one click away.
    await page.getByTestId("bot-dana").click();
    await page.getByTestId("bot-panel").getByText("Chief", { exact: true }).click();
    await page.getByRole("heading", { level: 1, name: /Chief @chief/ }).waitFor();
  });
});
