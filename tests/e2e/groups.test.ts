// Groups like a chat app, in a real browser (changes 0040-group-membership-and-clearing-a-conversation and
// 0042-group-info-like-a-chat-app): "<bot> joined/left the group" with its face, the ⋮ menu, adding members
// in a dialog, the group's info on the right (description, photo, mute, members, search), a deleted bot
// leaving its groups, clearing a conversation and deleting a group (specs/conversations, specs/web-app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-groups";
/** A 4 × 4 red PNG, the photo picked. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==";
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

    // Add Cid from the ⋮ menu, in the dialog that lists the bots outside the group.
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Add members" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("2 of 6 bots in the group").waitFor();
    await dialog.getByRole("checkbox", { name: /Cid/ }).check();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect.poll(() => events.allTextContents()).toContain("Cid joined the group");
    await page.locator(".group-subtitle").getByText("Ana, Bia, Cid").waitFor();

    // The name opens the group's info, a flyout on the right.
    await page.getByRole("heading", { level: 1, name: "Time" }).click();
    const info = page.getByTestId("group-info");
    await info.getByRole("heading", { name: "3 members" }).waitFor();
    const box = (await info.boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1270); // on the right edge

    // A description, said in the group and read by its bots.
    await info.getByRole("button", { name: "Add group description" }).click();
    await info.getByLabel("Group description").fill("Revisar os lançamentos");
    await info.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => events.allTextContents()).toContain("You changed the group description");
    expect(hub.repos.conversations.get(group.id)!.description).toBe("Revisar os lançamentos");

    // A photo: shrunk in the browser to a JPEG, shown in the header and the list.
    await info.locator('input[type="file"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
    await expect.poll(() => hub.repos.conversations.get(group.id)!.photo?.slice(0, 23)).toBe("data:image/jpeg;base64,");
    await page.getByTestId("group-face").locator("img.group-photo").waitFor();
    await page.getByTestId(`conv-${group.id}`).locator("img.group-photo").waitFor();

    // Mute: the list shows it.
    await info.getByRole("button", { name: "Mute", exact: true }).click();
    await page.getByTestId(`conv-${group.id}`).getByLabel("Muted").waitFor();
    expect(hub.repos.conversations.get(group.id)!.muted).toBe(true);

    // Remove Bia from her row in the members.
    await info.getByTestId("member-bia").locator(".member-main").click();
    await info.getByRole("button", { name: "Remove Bia from the group" }).click();
    await expect.poll(() => events.allTextContents()).toContain("Bia left the group");
    await info.getByRole("heading", { name: "2 members" }).waitFor();

    // Search the messages, ignoring accents, and show the one found.
    hub.timeline.post({ conversationId: group.id, kind: "message", author: { type: "user", id: null }, text: "A AÇÃO subiu hoje" });
    await page.locator(".group-head").getByRole("button", { name: "Search" }).click();
    await info.getByLabel("Search…").fill("acao");
    await info.locator("mark", { hasText: "AÇÃO" }).click();
    await page.locator(".message.flash").getByText("A AÇÃO subiu hoje").waitFor();

    // Delete Cid: it leaves the group, and the info follows.
    // The phone's Back (the Android app asks the page first): from the search back to the info.
    expect(await page.evaluate(() => (window as unknown as { __orbisBack(): boolean }).__orbisBack())).toBe(true);
    await info.getByRole("heading", { name: "2 members" }).waitFor();
    await hub.botService.delete(cid.id);
    await expect.poll(() => events.allTextContents()).toContain("Cid left the group (the bot was deleted)");
    await info.getByRole("heading", { name: "1 members" }).waitFor();
    await info.getByTestId("member-ana").locator(".member-main").click();
    expect(await info.getByRole("button", { name: /Remove .* from the group/ }).count()).toBe(0); // the last bot stays

    // Clear the conversation, then delete the group, from ⋮ → More.
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Clear conversation" }).click();
    await expect.poll(() => events.count()).toBe(0);
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete group" }).click();
    await page.getByRole("heading", { level: 1, name: "Time" }).waitFor({ state: "detached" });
    expect(hub.repos.conversations.get(group.id)).toBeUndefined();
  }, 60_000);
});
