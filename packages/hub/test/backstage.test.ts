// specs/conversations — how a conversation talks (change 0082-backstage): short and human or detailed, and
// the team's work backstage — the handoff cards, the answers coming back and the words of the bot waiting for
// them — while the final answer and what needs the user show in the chat; each conversation chooses, or
// follows the hub's default.
import { afterEach, describe, expect, it } from "vitest";
import type { Conversation, ConversationDefaults, Run, TimelineItem } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function settled(conversationId: string) {
  for (let i = 0; i < 200; i++) {
    const active = t!.hub.repos.runs.list({ conversationId }).filter((r) => ["queued", "running", "waiting"].includes(r.status));
    if (!active.length) break;
    await Promise.all(active.map((r) => t!.hub.engine.wait(r.id)));
  }
  return (await t!.api("GET", `/api/v1/conversations/${conversationId}/items`)).body as TimelineItem[];
}

const ASK = `/tool team.handoff {"to":"bia","task":"/reply A parte da Bia, longa e detalhada"}\n/reply Vou ver com a Bia e já te falo`;

describe("a conversation's way of talking", () => {
  it("follows the hub's default — short and backstage — until the conversation or the default changes", async () => {
    t = await testHub();
    expect((await t.api("GET", "/api/v1/conversations/defaults")).body).toEqual({ replyStyle: "chat", backstage: true } satisfies ConversationDefaults);
    const ana = await createBot(t, { name: "Ana" });
    const conv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body as Conversation;
    expect(conv).toMatchObject({ replyStyle: null, backstage: null });
    expect(t.hub.conversationStyle.of(conv.id)).toEqual({ replyStyle: "chat", backstage: true });

    // The conversation chooses; the default changes the others.
    const set = await t.api("PUT", `/api/v1/conversations/${conv.id}/style`, { replyStyle: "detailed" });
    expect(set.body).toMatchObject({ replyStyle: "detailed", backstage: null });
    expect(t.events.some((e) => e.type === "conversation.updated")).toBe(true);
    expect((await t.api("PUT", "/api/v1/conversations/defaults", { backstage: false })).body).toEqual({ replyStyle: "chat", backstage: false });
    expect(t.hub.conversationStyle.of(conv.id)).toEqual({ replyStyle: "detailed", backstage: false });
    expect((await t.api("PUT", `/api/v1/conversations/${conv.id}/style`, { replyStyle: "loud" })).status).toBe(400);
  });

  it("tells the bot that answers the user to keep it short, and never a handed-off task", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const conv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body as Conversation;
    const bot = t.hub.botService.get(ana.id);
    const run = (trigger: Run["trigger"]["type"]) => ({ conversationId: conv.id, trigger: { type: trigger, ref: null } }) as unknown as Run;
    expect(t.hub.conversationStyle.contextSection(bot, run("message"))).toMatch(/one to three short sentences/);
    expect(t.hub.conversationStyle.contextSection(bot, run("handoff"))).toBeNull();
    await t.api("PUT", `/api/v1/conversations/${conv.id}/style`, { replyStyle: "detailed", backstage: false });
    expect(t.hub.conversationStyle.contextSection(bot, run("message"))).toBeNull();
  });

  it("keeps the team's work backstage and shows only the final answer", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Squad", members: [ana.id, bia.id], leadBotId: ana.id })).body as Conversation;
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: ASK });
    const items = await settled(group.id);

    // Group events (members joining) aside.
    const seen = items.filter((i) => !i.backstage && i.kind !== "event");
    const back = items.filter((i) => i.backstage);
    // Backstage: the card, Bia's answer, and Ana's words while she waited.
    expect(back.map((i) => i.kind).sort()).toEqual(["card", "message", "message"]);
    expect(back.find((i) => i.text === "A parte da Bia, longa e detalhada")).toBeTruthy();
    expect(back.find((i) => i.text === "Vou ver com a Bia e já te falo")).toBeTruthy();
    // In the chat: the user's message and Ana's report, the answer to the user.
    expect(seen.map((i) => i.author.type)).toEqual(["user", "bot"]);
    const report = t.hub.repos.runs.get(seen[1]!.runId!)!;
    expect(report.trigger.type).toBe("report");
    expect(report.botId).toBe(ana.id);
    // The list of chats shows the answer, never the work.
    expect(t.hub.botService.get(bia.id).lastMessage?.text ?? null).toBeNull();
  });

  it("shows everything in the chat when the conversation turns the backstage off", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Squad", members: [ana.id, bia.id], leadBotId: ana.id })).body as Conversation;
    await t.api("PUT", `/api/v1/conversations/${group.id}/style`, { backstage: false });
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: ASK });
    const items = await settled(group.id);
    expect(items.some((i) => i.backstage)).toBe(false);
    expect(items.filter((i) => i.kind === "message")).toHaveLength(4);
  });
});
