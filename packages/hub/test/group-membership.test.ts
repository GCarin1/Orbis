// specs/conversations — groups like a chat app (change 0040-group-membership-and-clearing-a-conversation):
// "<bot> joined/left the group" with its face, the history open to a bot that joins and closed to one
// that left, a deleted bot leaving its groups, and clearing a conversation.
import { afterEach, describe, expect, it } from "vitest";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

type Item = { kind: string; text: string; event?: { type: string; data: Record<string, unknown> }; runId: string | null };
const items = async (t: TestHub, id: string): Promise<Item[]> => (await t.api("GET", `/api/v1/conversations/${id}/items?limit=200`)).body;
const memberEvents = async (t: TestHub, id: string) =>
  (await items(t, id)).filter((i) => i.event?.type?.startsWith("member.")).map((i) => `${i.event!.type}:${i.event!.data.name}`);
/** Post in a conversation and wait for every run it started; the runs come back. */
async function send(t: TestHub, id: string, text: string) {
  const res = await t.api("POST", `/api/v1/conversations/${id}/messages`, { text });
  for (const run of res.body.runs) await t.hub.engine.wait(run.id);
  return Promise.all(res.body.runs.map(async (r: { id: string }) => (await t.api("GET", `/api/v1/runs/${r.id}`)).body));
}

describe("joining and leaving a group", () => {
  it("says who joined, with the bot's face, opens the history to a newcomer, and says who left", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const cid = await createBot(t, { name: "Cid" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Time", members: [ana.id, bia.id] })).body;
    expect(await memberEvents(t, group.id)).toEqual(["member.joined:Ana", "member.joined:Bia"]);
    const joined = (await items(t, group.id)).find((i) => i.event?.type === "member.joined")!;
    expect(joined.text).toBe("Ana joined the group");
    expect(joined.event!.data).toMatchObject({ botId: ana.id, name: "Ana", handle: "ana", color: ana.avatar.color, shape: ana.avatar.shape });

    await send(t, group.id, "primeira mensagem");
    await send(t, group.id, "segunda mensagem");
    expect((await t.api("POST", `/api/v1/conversations/${group.id}/members`, { botId: cid.id })).body.members).toEqual([ana.id, bia.id, cid.id]);
    expect((await memberEvents(t, group.id)).at(-1)).toBe("member.joined:Cid");
    // The newcomer reads what was said before it joined.
    const [cidRun] = await send(t, group.id, `@${cid.handle} o que já foi dito?`);
    const seen = Number(/\((\d+) earlier items in context\)/.exec(cidRun.steps[0].text)![1]);
    expect(seen).toBeGreaterThanOrEqual(4); // the two messages and the two replies, at least

    // Bia leaves: it is said, and a mention no longer brings it in.
    const afterLeave = await t.api("DELETE", `/api/v1/conversations/${group.id}/members/${bia.id}`);
    expect(afterLeave.body.members).toEqual([ana.id, cid.id]);
    expect((await memberEvents(t, group.id)).at(-1)).toBe("member.left:Bia");
    expect(await send(t, group.id, `@${bia.handle} ainda está aí?`)).toEqual([]);
    const absent = (await items(t, group.id)).at(-1)!;
    expect(absent).toMatchObject({ kind: "event", event: { type: "member.absent", data: { botId: bia.id } } });
    expect(absent.text).toBe(`@${bia.handle} left this group: add it back to call it in.`);
    // Added back, it is called in again; a bot never in the group still is (as before).
    await t.api("POST", `/api/v1/conversations/${group.id}/members`, { botId: bia.id });
    expect((await send(t, group.id, `@${bia.handle} voltou?`)).map((r: { botId: string }) => r.botId)).toEqual([bia.id]);
  });

  it("lets a group shrink to one bot, and not to none", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Dupla", members: [ana.id, bia.id], leadBotId: ana.id })).body;
    const one = await t.api("DELETE", `/api/v1/conversations/${group.id}/members/${ana.id}`);
    expect(one.body).toMatchObject({ members: [bia.id], leadBotId: bia.id });
    const last = await t.api("DELETE", `/api/v1/conversations/${group.id}/members/${bia.id}`);
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe("group_too_small");
  });
});

describe("a deleted bot", () => {
  it("leaves each of its groups, said in each, and a group left with no bot goes too", async () => {
    t = await testHub();
    const [ana, bia, cid] = [await createBot(t, { name: "Ana" }), await createBot(t, { name: "Bia" }), await createBot(t, { name: "Cid" })];
    const trio = (await t.api("POST", "/api/v1/conversations", { title: "Trio", members: [ana.id, bia.id, cid.id], leadBotId: ana.id })).body;
    const pair = (await t.api("POST", "/api/v1/conversations", { title: "Par", members: [ana.id, bia.id] })).body;
    await t.api("DELETE", `/api/v1/conversations/${pair.id}/members/${bia.id}`); // Ana alone in it
    expect((await t.api("DELETE", `/api/v1/bots/${ana.id}`)).status).toBe(204);

    const after = (await t.api("GET", `/api/v1/conversations/${trio.id}`)).body;
    expect(after).toMatchObject({ members: [bia.id, cid.id], leadBotId: bia.id });
    const left = (await items(t, trio.id)).at(-1)!;
    expect(left).toMatchObject({
      text: "Ana left the group",
      event: { type: "member.left", data: { name: "Ana", reason: "deleted", color: ana.avatar.color } },
    });
    // The web app hears it: the group's new members, and the group that went.
    expect(
      t.events.some(
        (e) =>
          e.type === "conversation.updated" &&
          (e.data as { conversation: { id: string; members: string[] } }).conversation.id === trio.id &&
          (e.data as { conversation: { members: string[] } }).conversation.members.length === 2,
      ),
    ).toBe(true);
    expect(t.events.some((e) => e.type === "conversation.deleted" && (e.data as { conversationId: string }).conversationId === pair.id)).toBe(true);
    expect((await t.api("GET", `/api/v1/conversations/${pair.id}`)).status).toBe(404);
  });
});

describe("clearing a conversation", () => {
  it("deletes its items, the bots' sessions of it and the run summaries it left, and keeps what a bot saved on purpose", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const direct = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    await send(t, direct.id, "resuma o relatório");
    await send(t, direct.id, '/tool memory.save {"text": "O usuário prefere respostas curtas", "kind": "preference"}');
    t.hub.repos.sessions.set(ana.id, direct.id, "mock", "session-1");
    const before = (await t.api("GET", `/api/v1/bots/${ana.id}/memory`)).body as Array<{ kind: string }>;
    expect(before.some((m) => m.kind === "summary")).toBe(true);
    expect((await items(t, direct.id)).length).toBeGreaterThan(0);

    const res = await t.api("DELETE", `/api/v1/conversations/${direct.id}/items`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: direct.id, lastItemAt: null });
    expect(await items(t, direct.id)).toEqual([]);
    expect(t.events.some((e) => e.type === "conversation.cleared" && (e.data as { conversationId: string }).conversationId === direct.id)).toBe(true);
    expect(t.hub.repos.sessions.get(ana.id, direct.id, "mock")).toBeNull();
    const kept = (await t.api("GET", `/api/v1/bots/${ana.id}/memory`)).body as Array<{ kind: string; text: string }>;
    expect(kept.some((m) => m.kind === "summary")).toBe(false);
    expect(kept.find((m) => m.kind === "preference")?.text).toBe("O usuário prefere respostas curtas");
    // The conversation goes on, from nothing.
    await send(t, direct.id, "oi de novo");
    expect((await items(t, direct.id)).length).toBe(2);
  });

  it("is refused while a bot works in it", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const direct = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${direct.id}/messages`, { text: "/sleep 2000" });
    const busy = await t.api("DELETE", `/api/v1/conversations/${direct.id}/items`);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe("conversation_busy");
    await t.api("POST", `/api/v1/runs/${posted.body.runs[0].id}/cancel`);
    await t.hub.engine.wait(posted.body.runs[0].id);
    expect((await t.api("DELETE", `/api/v1/conversations/${direct.id}/items`)).status).toBe(200);
  });
});
