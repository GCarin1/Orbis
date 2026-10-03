// specs/squads — squads in a real browser: the user creates two squads from the Squads screen, picks a
// representative and one manager for both, sees the org chart, opens the squad's chat and the squads' room,
// filters the sidebar by squad, and a message to @data in the room wakes Data's representative.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-squads";
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

describe("squads in a browser", () => {
  it("organizes bots in squads with a representative and a manager, and squads talk to each other", async () => {
    for (const [name, role] of [
      ["Ana", "Analista"],
      ["Bob", "Dev"],
      ["Caio", "QA"],
      ["Duda", "Dados"],
      ["Max", "Diretor"],
    ] as const) {
      hub.botService.create({ name, role, brain: { kind: "mock" } });
    }
    const id = (name: string) => hub.botService.list().find((b) => b.name === name)!.id;
    const page = await (await browser.newContext({ locale: "en-US", viewport: { width: 1366, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByRole("button", { name: "🛡 Squads" }).click();
    const screen = page.getByTestId("squads");

    const create = async (name: string, members: string[]) => {
      await screen.getByRole("button", { name: "New squad" }).first().click();
      const form = screen.getByTestId("squad-new");
      await form.getByLabel("Name").fill(name);
      for (const m of members) await form.getByRole("checkbox", { name: new RegExp(m) }).check();
      await form.getByRole("button", { name: "Create squad" }).click();
      await screen.getByRole("article", { name }).waitFor();
    };
    await create("Growth", ["Ana", "Bob"]);
    await create("Data", ["Caio", "Duda"]);

    const growth = screen.getByRole("article", { name: "Growth" });
    await growth.getByRole("button", { name: "Make Bob the representative" }).click();
    await growth.getByText("★ Representative").waitFor();
    await expect.poll(() => hub.squads.get("growth").representativeId).toBe(id("Bob"));

    // One manager for both squads: the org chart shows them under Max.
    await screen.getByLabel("One manager for every squad").selectOption({ label: "Max" });
    await screen.getByRole("button", { name: "Apply to all" }).click();
    const chart = screen.getByRole("region", { name: "Org chart" });
    await chart.getByText("★ Bob · bots: 2").waitFor();
    await chart.getByText("★ Caio · bots: 2").waitFor();
    expect(hub.botService.get(id("Ana")).reportsTo).toBe(id("Bob"));
    expect(hub.botService.get(id("Bob")).reportsTo).toBe(id("Max"));

    // The sidebar filters by squad.
    await page.getByRole("group", { name: "Filter by squad" }).getByRole("button", { name: "Data" }).click();
    await page.getByTestId("bot-caio").waitFor();
    expect(await page.getByTestId("bot-ana").count()).toBe(0);
    await page.getByRole("group", { name: "Filter by squad" }).getByRole("button", { name: "All" }).click();

    // The squad's chat, and the room where @data wakes Data's representative.
    await growth.getByRole("button", { name: /Squad chat/ }).click();
    await page.getByRole("heading", { level: 1, name: "Growth" }).waitFor();
    await page.getByRole("button", { name: "🛡 Squads" }).click();
    await screen.getByRole("button", { name: /Squads room/ }).click();
    await page.getByRole("heading", { level: 1, name: "Squads" }).waitFor();
    const room = hub.squads.view().roomId!;
    expect(hub.repos.conversations.get(room)!.members.sort()).toEqual([id("Bob"), id("Caio"), id("Max")].sort());
    await page.getByRole("textbox", { name: /Message/ }).fill("@data /reply Data is on it");
    await page.keyboard.press("Enter");
    await page.getByText("Data is on it").first().waitFor();
    expect(hub.repos.runs.list({ botId: id("Caio") }).length).toBe(1);
  }, 90_000);
});
