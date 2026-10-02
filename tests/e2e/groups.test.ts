// Groups like a chat app, in a real browser (change 0040-group-membership-and-clearing-a-conversation):
// "<bot> joined/left the group" with its face, adding and removing members from the group's header,
// a deleted bot leaving its groups, clearing a conversation and deleting a group (specs/conversations,
// specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-groups";
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

describe("groups in a browser", () => {
  it("shows joins and leaves with faces, adds and removes members, follows a deleted bot out, clears and deletes", async () => {
    const ana = hub.botService.create({ name: "Ana", brain: { kind: "mock" } });
    const bia = hub.botService.create({ name: "Bia", brain: { kind: "mock" } });
    const cid = hub.botService.create({ name: "Cid", brain: { kind: "mock" } });
    const group = hub.conversationService.createGroup({ title: "Time", members: [ana.id, bia.id] });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    page.on("dialog", (d) => void d.accept()); // the confirmations
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId(`conv-${group.id}`).click();
    await page.getByRole("heading", { level: 1, name: "Time" }).waitFor();

    const events = page.getByTestId("event");
    await expect.poll(() => events.allTextContents()).toEqual(["Ana joined the group", "Bia joined the group"]);
    // Each one with the bot's face.
    expect(await events.first().locator(".avatar").count()).toBe(1);

    // Add Cid from the header.
    await page.getByRole("combobox", { name: "Add a bot to the group" }).selectOption({ label: "Cid (@cid)" });
    await expect.poll(() => events.allTextContents()).toContain("Cid joined the group");
    await page.getByText("3 bots", { exact: true }).waitFor();

    // Remove Bia from her chip.
    await page.getByRole("button", { name: "Remove Bia from the group" }).click();
    await expect.poll(() => events.allTextContents()).toContain("Bia left the group");
    await page.getByText("2 bots", { exact: true }).waitFor();

    // Delete Cid: it leaves the group, and the header follows.
    await hub.botService.delete(cid.id);
    await expect.poll(() => events.allTextContents()).toContain("Cid left the group (the bot was deleted)");
    await page.getByText("1 bots", { exact: true }).waitFor();
    expect(await page.getByRole("button", { name: /Remove .* from the group/ }).count()).toBe(0); // the last bot stays

    // Clear the conversation, then delete the group.
    await page.getByRole("button", { name: "Clear conversation" }).click();
    await expect.poll(() => events.count()).toBe(0);
    await page.getByRole("button", { name: "Delete group" }).click();
    await page.getByRole("heading", { level: 1, name: "Time" }).waitFor({ state: "detached" });
    expect(hub.repos.conversations.get(group.id)).toBeUndefined();
  }, 60_000);
});
