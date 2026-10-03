// specs/web-app — on a phone (390 px), no screen, panel or dialog scrolls sideways (skill
// phone-layout-no-sideways-scroll). Found by the owner in the bot settings: the brain <select> sized itself
// to its longest option and its <fieldset> (min-inline-size: min-content) pushed the panel to 600 px.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";
import { recruiterBrain } from "./recruiter-brain.js";

const TOKEN = "e2e-phone";
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
  await hub?.hiring.wait();
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** What scrolls sideways that should not: the page, or any scrolling box but those meant to (code, tables, rows of chips). */
function sideways(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const meant = "pre, code, .table-scroll, .favorites, .settings-tabs, .market-tabs, .link-chips, .mcp-cats, .mcp-featured-row, .mcp-auth, .squad-filter";
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].map((c) => `.${c}`).join("")}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}`;
    const found: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) found.push(`the page: ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.closest(meant)) continue;
      const style = getComputedStyle(el);
      if (!/auto|scroll/.test(style.overflowX) || el.clientWidth === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        // Name the widest child too: it is usually the cause.
        const widest = [...el.querySelectorAll<HTMLElement>("*")].sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
        found.push(`${name(el)}: ${el.scrollWidth} > ${el.clientWidth}${widest ? ` (widest: ${name(widest)})` : ""}`);
      }
    }
    return found;
  });
}

describe("the web app on a phone", () => {
  it("scrolls no screen, panel or dialog sideways", async () => {
    const ana = hub.botService.create({ name: "Ana", role: "Pesquisa e análise de mercado", brain: { kind: "claude-code" } });
    const bia = hub.botService.create({ name: "Bia", role: "QA", brain: { kind: "mock" } });
    const group = hub.conversationService.createGroup({ title: "Time de lançamento com um nome bem comprido", members: [ana.id, bia.id] });
    hub.timeline.post({
      conversationId: group.id,
      kind: "message",
      author: { type: "user", id: null },
      text: "Vejam https://example.com/um/endereco/muito/comprido/para/caber/na/tela/do/celular?com=parametros",
    });
    let page!: Page;
    const failures: string[] = [];
    const check = async (where: string) => {
      await page.waitForTimeout(150);
      for (const found of await sideways(page)) failures.push(`${where} — ${found}`);
    };
    // Each screen from a fresh phone: the app remembers the conversation that was open.
    const home = async () => {
      await page?.context().close();
      page = await (await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
      await page.goto(`${url}/#token=${TOKEN}`);
      await page.getByTestId("bot-ana").waitFor();
    };

    await home();
    await check("the list");
    await page.getByTestId("bot-ana").click();
    await check("a bot's conversation");
    await page.getByRole("button", { name: "Details" }).click();
    await check("the bot's details");
    // On a phone each panel covers the conversation: start again from the list for the next one.
    await home();
    await page.getByTestId("bot-ana").click();
    await page.getByRole("button", { name: "Bot settings", exact: true }).click();
    const panel = page.getByTestId("settings-panel");
    await panel.waitFor();
    for (const kind of ["claude-code", "mock", "openai", "anthropic", "ollama", "chat-http", "custom-cli", "codex"]) {
      await panel.locator('select[name="settings-brain"]').selectOption(kind);
      await check(`the bot settings with the ${kind} brain`);
    }
    await home();
    await page.getByTestId("bot-ana").click();
    await page.getByRole("button", { name: "Routines" }).click();
    await check("the routines");
    await home();
    await page.getByTestId("bot-ana").click();
    await page.getByRole("button", { name: "Computer" }).click();
    await check("the computer");

    await home();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "+ New bot" }).click();
    for (const kind of ["claude-code", "openai", "chat-http", "custom-cli"]) {
      await page.locator('select[name="brain"]').selectOption(kind);
      await check(`the new-bot screen with the ${kind} brain`);
    }
    await home();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "+ New group" }).click();
    await check("the new-group dialog");

    await home();
    await page.getByTestId(`conv-${group.id}`).click();
    await check("a group");
    await page.getByRole("heading", { level: 1 }).click();
    await page.getByTestId("group-info").waitFor();
    await check("the group's info");
    await page.getByTestId("group-info").getByRole("button", { name: "Search", exact: true }).click();
    await check("the group's search");
    await home();
    await page.getByTestId(`conv-${group.id}`).click();
    await page.getByRole("button", { name: "More options" }).click();
    await check("the group's menu");
    await page.getByRole("menuitem", { name: "Add members" }).click();
    await check("the add-members dialog");

    for (const [nav, tabs] of [
      ["⚙ Settings", ["Brains", "Computers", "Voice and appearance", "Phone"]],
      ["🧩 MCP", ["Explore", "Connected"]],
      ["📘 Skills", []],
      ["📊 Usage", []],
    ] as const) {
      await home();
      await page.getByRole("button", { name: nav }).click();
      await check(nav);
      for (const tab of tabs) {
        await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
        await check(`${nav} → ${tab}`);
      }
    }
    // The MCP screen's sheets: a server's details and your own server.
    await home();
    await page.getByRole("button", { name: "🧩 MCP" }).click();
    await page.getByTestId("catalog-github").click();
    await page.getByTestId("details-github").waitFor();
    await check("an MCP's details");
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Your own server" }).click();
    await page.getByTestId("custom-server").waitFor();
    await check("your own MCP server");

    // Squads: the org chart, a squad's card, the bots in no squad, and a new squad's form.
    hub.squads.create({ name: "Squad de pesquisa e análise de mercado", members: [ana.id], managerId: bia.id });
    await home();
    await page.getByRole("button", { name: "🛡 Squads" }).click();
    await page.getByRole("article").first().waitFor();
    await check("squads");
    await page.getByRole("button", { name: "New squad" }).first().click();
    await check("a new squad");

    // Hiring: a new opening, a round of résumés, and the hire sheet (a scripted recruiter writes them).
    hub.brains.register(recruiterBrain());
    hub.hiring.start({ basis: "project", brief: "Um painel de ações brasileiras com alertas de preço", recruiterId: bia.id, count: 4, lang: "pt-BR" });
    await hub.hiring.wait();
    await home();
    await page.getByRole("button", { name: "💼 Hiring" }).click();
    await page.getByRole("article").first().waitFor();
    await check("hiring");
    await page.getByRole("radio", { name: "My team" }).click();
    await check("hiring for a team");
    await page.getByRole("article").first().getByRole("button", { name: "Hire" }).click();
    await page.getByTestId("hire-sheet").waitFor();
    await check("the hire sheet");
    expect(failures).toEqual([]);
  }, 180_000);
});
