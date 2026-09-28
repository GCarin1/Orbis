// specs/conversations — acceptance criteria 1 to 4.
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

  it("routes group messages: a mention runs that member, @everyone runs all, no mention runs the lead (criterion 2)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const cara = await createBot(t, { name: "Cara" });
    const outsider = await createBot(t, { name: "Dan" });
    const res = await t.api("POST", "/api/v1/conversations", { title: "Release", members: ["@ana", bob.id, "cara"], leadBotId: "bob" });
    expect(res.status).toBe(201);
    const group = res.body;
    expect(group).toMatchObject({ kind: "group", title: "Release", members: [ana.id, bob.id, cara.id], leadBotId: bob.id });

    const send = async (text: string) => {
      const posted = await t!.api("POST", `/api/v1/conversations/${group.id}/messages`, { text });
      const runs = await Promise.all(posted.body.runs.map((r: { id: string }) => t!.hub.engine.wait(r.id)));
      return runs.map((r) => r.botId).sort();
    };
    expect(await send("@ana please check the logs")).toEqual([ana.id]);
    expect(await send("@everyone standup in 5")).toEqual([ana.id, bob.id, cara.id].sort());
    expect(await send("who can look at this?")).toEqual([bob.id]);
    // A bot of the team outside the group answers here when mentioned.
    expect(await send(`@${outsider.handle} are you there?`)).toEqual([outsider.id]);
    expect((await t.api("GET", "/api/v1/conversations")).body.map((c: { id: string }) => c.id)).toContain(group.id);
  });

  it("refuses a seventh member and keeps groups between 2 and 6 bots (criterion 3)", async () => {
    t = await testHub();
    const bots = [];
    for (const name of ["A1", "B2", "C3", "D4", "E5", "F6", "G7"]) bots.push(await createBot(t, { name }));
    const tooBig = await t.api("POST", "/api/v1/conversations", { title: "Big", members: bots.map((b) => b.id) });
    expect(tooBig.status).toBe(409);
    expect(tooBig.body.error.code).toBe("group_full");
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Six", members: bots.slice(0, 6).map((b) => b.id) })).body;
    const seventh = await t.api("POST", `/api/v1/conversations/${group.id}/members`, { botId: bots[6].id });
    expect(seventh.status).toBe(409);
    expect(seventh.body.error.code).toBe("group_full");
    expect((await t.api("POST", "/api/v1/conversations", { title: "Solo", members: [bots[0].id] })).status).toBe(400);

    // Removing the lead passes the lead to the next member; a group never drops below two.
    const pair = (await t.api("POST", "/api/v1/conversations", { title: "Pair", members: [bots[0].id, bots[1].id, bots[2].id] })).body;
    const afterRemove = await t.api("DELETE", `/api/v1/conversations/${pair.id}/members/${bots[0].id}`);
    expect(afterRemove.body).toMatchObject({ members: [bots[1].id, bots[2].id], leadBotId: bots[1].id });
    expect((await t.api("DELETE", `/api/v1/conversations/${pair.id}/members/${bots[1].id}`)).status).toBe(409);
    const renamed = await t.api("PATCH", `/api/v1/conversations/${pair.id}`, { title: "Duo", leadBotId: bots[2].id });
    expect(renamed.body).toMatchObject({ title: "Duo", leadBotId: bots[2].id });
    expect((await t.api("DELETE", `/api/v1/conversations/${pair.id}`)).status).toBe(204);
    expect(t.events.at(-1)).toMatchObject({ type: "conversation.deleted", data: { conversationId: pair.id } });
  });
});
