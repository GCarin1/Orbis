// The tools marketplace in a real browser (specs/web-app, specs/tool-gateway):
// the user browses the catalog, adds their own MCP server, gives it to one bot,
// sees it among that bot's tools, and the bot calls it (change
// 0018-mcp-marketplace).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-marketplace";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");
const fakeServer = path.resolve(import.meta.dirname, "../../packages/hub/test/fixtures/fake-mcp-server.mjs");

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

describe("the tools marketplace in a browser", () => {
  it("adds an MCP server, gives it to one bot, and that bot calls its tool", async () => {
    const ana = hub.botService.create({ name: "Ana", role: "Research", brain: { kind: "mock" } });
    const bob = hub.botService.create({ name: "Bob", role: "QA", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);

    await page.getByRole("button", { name: /MCP/ }).first().click();
    const market = page.getByTestId("marketplace");
    await market.getByTestId("catalog-deepwiki").waitFor();
    expect(await market.getByTestId("catalog-notion").textContent()).toContain("Sign in");
    // Each service shows its own logo, not an emoji (change 0045).
    expect(await market.getByTestId("catalog-github").locator("img").getAttribute("src")).toBe("/logos/mcp/github.svg");
    expect(
      await market
        .getByTestId("catalog-github")
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
    await market.getByRole("searchbox", { name: "Search MCPs" }).fill("linear");
    await market.getByTestId("catalog-linear").waitFor();
    expect(await market.getByTestId("catalog-deepwiki").count()).toBe(0);

    await market.getByRole("tab", { name: /Connected/ }).click();
    await market.getByRole("button", { name: "Your own server" }).click();
    await market.getByLabel("Name").fill("Fake Notes");
    await market.getByRole("radio", { name: "Program (on this computer)" }).click();
    await market.getByLabel("Command").fill(`${process.execPath} ${fakeServer} from-arg`);
    await market.getByLabel(/Environment variables/).fill("GREETING=hello from e2e");
    await market.getByRole("button", { name: "Connect" }).click();
    const card = market.getByTestId("server-fake-notes");
    await card.getByText("Connected · 2 tools").waitFor({ timeout: 20_000 });

    await card.getByRole("checkbox", { name: /Ana/ }).check();
    await expect.poll(() => hub.botService.get(ana.id).tools).toEqual(["*", "mcp.fake-notes.*"]);
    expect(hub.botService.get(bob.id).tools).toEqual(["*"]);

    // Ana's settings show the server among her tools.
    await page.getByTestId("bot-ana").click();
    await page.getByRole("button", { name: "Bot settings", exact: true }).click();
    const group = page.getByTestId("settings-panel").getByTestId("tool-group-mcp.fake-notes");
    await group.waitFor();
    expect(await group.locator("input").isChecked()).toBe(true);

    // Ana calls the tool; its answer carries the key and the argument the server got.
    const composer = page.getByRole("textbox", { name: /Message Ana/ });
    await composer.fill('/tool mcp.fake-notes.echo {"text":"ping"}');
    await composer.press("Enter");
    await expect
      .poll(
        () =>
          hub.repos.runs
            .list({ botId: ana.id, limit: 5 })
            .find((r) => r.status === "done")
            ?.steps.find((s) => s.type === "tool_result")?.output ?? "",
        { timeout: 15_000 },
      )
      .toContain("hello from e2e | from-arg | ping");
  });
});
