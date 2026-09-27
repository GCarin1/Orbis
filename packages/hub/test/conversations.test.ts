// specs/conversations — acceptance criteria 1 and 4 (groups arrive with the collaboration change).
import { afterEach, describe, expect, it } from "vitest";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("conversations", () => {
  it("starts exactly one run of the bot per direct message and appends the reply to the same timeline (criterion 1)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { conversation, item, runs } = await chat(t, bot.id, "check the deploy");
    expect(conversation).toMatchObject({ kind: "direct", members: [bot.id], leadBotId: bot.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ botId: bot.id, conversationId: conversation.id, status: "done", trigger: { type: "message", ref: item.id } });

    const items = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body;
    expect(items.map((i: { author: { type: string } }) => i.author.type)).toEqual(["user", "bot"]);
    expect(items[1]).toMatchObject({ kind: "message", author: { type: "bot", id: bot.id }, text: "[Ana] check the deploy", runId: runs[0].id });

    // Asking again for the direct conversation returns the same one.
    const again = (await t.api("GET", `/api/v1/bots/${bot.handle}/conversation`)).body;
    expect(again.id).toBe(conversation.id);
    // The roster shows the last message.
    expect((await t.api("GET", `/api/v1/bots/${bot.id}`)).body.lastMessage.text).toBe("[Ana] check the deploy");
  });

  it("stores thread parents and broadcasts reaction changes as timeline.item events (criterion 4)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { conversation, item } = await chat(t, bot.id, "first");
    const reply = await t.api("POST", `/api/v1/conversations/${conversation.id}/messages`, { text: "/reply in thread", parentId: item.id });
    expect(reply.status).toBe(201);
    expect(reply.body.item.parentId).toBe(item.id);
    const run = await t.hub.engine.wait(reply.body.runs[0].id);
    const botReply = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body.find(
      (i: { runId: string | null }) => i.runId === run.id,
    );
    expect(botReply.parentId).toBe(item.id);

    const before = t.events.length;
    const reacted = await t.api("POST", `/api/v1/items/${item.id}/reactions`, { emoji: "👍" });
    expect(reacted.body.reactions).toEqual({ "👍": 1 });
    const event = t.events.slice(before).find((e) => e.type === "timeline.item");
    expect(event?.data).toMatchObject({ conversationId: conversation.id, item: { id: item.id, reactions: { "👍": 1 } } });
    const removed = await t.api("DELETE", `/api/v1/items/${item.id}/reactions/${encodeURIComponent("👍")}`);
    expect(removed.body.reactions).toEqual({});

    const badParent = await t.api("POST", `/api/v1/conversations/${conversation.id}/messages`, { text: "x", parentId: "itm_nope" });
    expect(badParent.status).toBe(400);
  });

  it("refuses an empty message and pages the timeline", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const empty = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "   " });
    expect(empty.status).toBe(400);
    expect(empty.body.error.fields.text).toBeDefined();

    for (const n of [1, 2, 3]) await chat(t, bot.id, `/reply r${n}`);
    const all = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(all).toHaveLength(6);
    const page = (await t.api("GET", `/api/v1/conversations/${conv.id}/items?before=${all[4].id}&limit=2`)).body;
    expect(page.map((i: { id: string }) => i.id)).toEqual([all[2].id, all[3].id]);
  });
});
