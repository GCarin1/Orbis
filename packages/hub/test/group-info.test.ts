// specs/conversations — a group's info like a chat app's (change 0042-group-info-like-a-chat-app): its name,
// description, photo, lead and mute, said in the group when they change; the description read by its bots;
// searching its messages and listing its links.
import { afterEach, describe, expect, it } from "vitest";
import type { Run } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

type Item = { kind: string; text: string; event?: { type: string; data: Record<string, unknown> } };
const groupEvents = async (t: TestHub, id: string) =>
  ((await t.api("GET", `/api/v1/conversations/${id}/items?limit=200`)).body as Item[]).filter((i) => i.event?.type.startsWith("group.")).map((i) => i.text);
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("a group's info", () => {
  it("changes the name, description, photo, lead and mute, saying in the group what everyone sees change", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const created = await t.api("POST", "/api/v1/conversations", { title: "Time", members: [ana.id, bia.id], description: "  Lançamentos da semana  " });
    expect(created.body).toMatchObject({ description: "Lançamentos da semana", photo: null, muted: false });
    const id = created.body.id as string;

    const patched = await t.api("PATCH", `/api/v1/conversations/${id}`, {
      title: "Time de lançamento",
      description: "Planejar e revisar os lançamentos.",
      photo: PHOTO,
      leadBotId: bia.id,
      muted: true,
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      title: "Time de lançamento",
      description: "Planejar e revisar os lançamentos.",
      photo: PHOTO,
      leadBotId: bia.id,
      muted: true,
    });
    expect(await groupEvents(t, id)).toEqual([
      'You renamed the group "Time de lançamento"',
      "You changed the group's description",
      "You changed the group's photo",
      "Bia now leads the group",
    ]);
    // Muting and the same values again say nothing; removing the photo and the description do.
    await t.api("PATCH", `/api/v1/conversations/${id}`, { muted: false, title: "Time de lançamento" });
    await t.api("PATCH", `/api/v1/conversations/${id}`, { photo: null, description: "" });
    expect((await groupEvents(t, id)).slice(4)).toEqual(["You removed the group's description", "You removed the group's photo"]);
    expect((await t.api("GET", `/api/v1/conversations/${id}`)).body).toMatchObject({ photo: null, description: "", muted: false });

    // Not an image, or a direct conversation: refused.
    expect((await t.api("PATCH", `/api/v1/conversations/${id}`, { photo: "data:text/html;base64,PGI+" })).status).toBe(400);
    const direct = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    expect((await t.api("PATCH", `/api/v1/conversations/${direct.id}`, { muted: true })).status).toBe(400);
    expect((await t.api("GET", "/api/v1/conversations/limits")).body).toEqual({ maxGroupSize: t.hub.config.maxGroupSize });
  });

  it("gives its bots the description, and keeps the info's events out of their history", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const id = (await t.api("POST", "/api/v1/conversations", { title: "Time", members: [ana.id, bia.id] })).body.id as string;
    await t.api("PATCH", `/api/v1/conversations/${id}`, { description: "Respondam sempre em tópicos." });
    const section = t.hub.conversationService.contextSection(t.hub.botService.get(ana.id), { conversationId: id } as Run)!;
    expect(section).toContain('Where you are: the group "Time"');
    expect(section).toContain("The group's description, written by the user (what this group is for; follow it here):\nRespondam sempre em tópicos.");

    const res = await t.api("POST", `/api/v1/conversations/${id}/messages`, { text: "oi" });
    const run = await t.hub.engine.wait(res.body.runs[0].id);
    // The mock brain says how many earlier items it got: the joined events and the description change are not among them.
    expect(run.steps[0]).toMatchObject({ text: expect.stringContaining("(0 earlier items in context)") });
  });
});

describe("searching a conversation and its links", () => {
  it("finds messages ignoring case and accents, newest first, and lists each link once", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const id = (await t.api("POST", "/api/v1/conversations", { title: "Time", members: [ana.id, bia.id] })).body.id as string;
    const post = (text: string) => t!.hub.timeline.post({ conversationId: id, kind: "message", author: { type: "user", id: null }, text });
    post("A AÇÃO subiu hoje: https://example.com/acoes/petr4.");
    post("Veja [o relatório](https://example.com/relatorio) e https://example.com/acoes/petr4");
    post("nada a ver");

    const found = (await t.api("GET", `/api/v1/conversations/${id}/search?q=${encodeURIComponent("acao")}`)).body as Item[];
    expect(found.map((i) => i.text)).toEqual(["A AÇÃO subiu hoje: https://example.com/acoes/petr4."]);
    expect(((await t.api("GET", `/api/v1/conversations/${id}/search?q=example`)).body as Item[]).map((i) => i.text.slice(0, 4))).toEqual(["Veja", "A AÇ"]);
    expect((await t.api("GET", `/api/v1/conversations/${id}/search?q=`)).status).toBe(400);

    const links = (await t.api("GET", `/api/v1/conversations/${id}/links`)).body as Array<{ url: string; author: { type: string } }>;
    expect(links.map((l) => l.url)).toEqual(["https://example.com/relatorio", "https://example.com/acoes/petr4"]);
    expect(links[0]!.author.type).toBe("user");
  });
});
