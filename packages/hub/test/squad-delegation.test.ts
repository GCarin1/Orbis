// specs/squads — delegating to a squad happens in the squad's chat (change 0083): the sender's message goes
// there, the squad works there (its representative sharing parts with the squad), and the answer — the
// representative's report once its squad's parts are back — comes back to the sender's conversation. A
// squad's bot is never brought into the sender's conversation, by a handoff or by a mention.
import { afterEach, describe, expect, it } from "vitest";
import type { Conversation, HandoffCardData, SquadsView, TimelineItem } from "@orbis/shared";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;

async function settled(...conversationIds: string[]) {
  for (let i = 0; i < 200; i++) {
    const active = conversationIds.flatMap((id) => t!.hub.repos.runs.list({ conversationId: id })).filter((r) => ["queued", "running", "waiting"].includes(r.status));
    if (!active.length) break;
    await Promise.all(active.map((r) => t!.hub.engine.wait(r.id)));
  }
}

const items = async (id: string) => (await t!.api("GET", `/api/v1/conversations/${id}/items`)).body as TimelineItem[];

async function team() {
  t = await testHub();
  const max = await createBot(t, { name: "Max", role: "Director" });
  const ana = await createBot(t, { name: "Ana", role: "Analyst" });
  const bia = await createBot(t, { name: "Bia", role: "Designer" });
  const view = (await t.api("POST", "/api/v1/squads", { name: "Growth", members: [ana.id, bia.id], representativeId: ana.id, managerId: max.id })).body as SquadsView;
  const room = view.squads[0]!.conversationId!;
  return { max, ana, bia, room };
}

describe("delegating to a squad", () => {
  it("posts the task in the squad's chat, lets the squad work there and brings the final answer back", async () => {
    const { max, ana, bia, room } = await team();
    // Ana, the representative, shares a part with Bia and waits; her report is the squad's answer.
    const anaWork = [tool("team.handoff", { to: "bia", task: "/reply Banner pronto em 3 versões" }), "/reply Vou dividir com a Bia"].join("\n");
    const { conversation, runs } = await chat(t!, max.id, tool("team.handoff", { to: "@growth", task: anaWork }));
    const result = runs[0]!.steps.find((s) => s.type === "tool_result") as { output: string; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.output).toContain("in the chat of the squad Growth (@growth)");
    await settled(conversation.id, room);

    // The sender's conversation: the card, the report back — and no word of the squad's bots.
    const mine = await items(conversation.id);
    expect(mine.filter((i) => i.author.type === "bot" && (i.author.id === ana.id || i.author.id === bia.id))).toEqual([]);
    const card = mine.find((i) => i.card?.type === "handoff")!;
    const data = card.card!.data as HandoffCardData;
    expect(card.card!.state).toBe("done");
    expect(data).toMatchObject({ to: ana.id, roomId: room, squad: "Growth" });

    // The squad's chat: Max's message, Ana's work under it, the card to Bia and Bia's answer.
    const there = await items(room);
    const asked = there.find((i) => i.kind === "message" && i.author.id === max.id)!;
    expect(asked.text).toMatch(/^@ana /);
    expect(data.roomItemId).toBe(asked.id);
    expect(there.find((i) => i.card?.type === "handoff" && (i.card.data as HandoffCardData).to === bia.id)).toBeTruthy();
    expect(there.find((i) => i.author.id === bia.id && i.text === "Banner pronto em 3 versões")).toBeTruthy();
    const anaRuns = t!.hub.repos.runs.list({ botId: ana.id });
    expect(anaRuns.every((r) => r.conversationId === room)).toBe(true);
    const handed = anaRuns.find((r) => r.trigger.type === "handoff")!;
    expect(there.find((i) => i.runId === handed.id && i.kind === "message")?.parentId).toBe(asked.id);
    // In the squad's chat Ana's words while she waits stay backstage and her answer is in sight; it closes Max's card.
    expect(there.find((i) => i.runId === handed.id && i.kind === "message")?.backstage).toBe(true);
    const anaReport = anaRuns.find((r) => r.trigger.type === "report")!;
    expect(anaReport.conversationId).toBe(room);
    expect(there.find((i) => i.runId === anaReport.id && i.kind === "message")?.backstage).toBeFalsy();
    expect(data.answerRunId).toBe(anaReport.id);

    // Max hears the squad's final answer, not Ana's "I'll split it".
    const maxReport = t!.hub.repos.runs.list({ botId: max.id }).find((r) => r.trigger.type === "report")!;
    expect(maxReport.conversationId).toBe(conversation.id);
    expect(maxReport.input).toContain(anaReport.reply!.slice(0, 40));
    expect(maxReport.input).not.toContain("Answer:\nVou dividir com a Bia");
  });

  it("hands a squad's bot named in a reply over to its squad's chat instead of calling it here", async () => {
    const { max, bia, room } = await team();
    const { conversation } = await chat(t!, max.id, "/reply @bia pode revisar o texto do banner?");
    await settled(conversation.id, room);
    const mine = await items(conversation.id);
    expect(mine.filter((i) => i.author.id === bia.id)).toEqual([]);
    const card = mine.find((i) => i.card?.type === "handoff")!;
    expect(card.card!.data).toMatchObject({ to: bia.id, roomId: room });
    const biaRuns = t!.hub.repos.runs.list({ botId: bia.id });
    expect(biaRuns.length).toBe(1);
    expect(biaRuns[0]).toMatchObject({ conversationId: room, trigger: { type: "handoff" } });
  });

  it("keeps work in a conversation the squad's bot is already in, and tells the manager how to reach its squads", async () => {
    const { max, ana, bia } = await team();
    const group = (await t!.api("POST", "/api/v1/conversations", { title: "Projeto", members: [max.id, bia.id], leadBotId: max.id })).body as Conversation;
    const posted = await t!.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: tool("team.handoff", { to: "bia", task: "/reply feito" }) });
    await t!.hub.engine.wait(posted.body.runs[0].id);
    await settled(group.id);
    const card = (await items(group.id)).find((i) => i.card?.type === "handoff")!;
    expect((card.card!.data as HandoffCardData).roomId).toBeUndefined();
    expect(t!.hub.repos.runs.list({ botId: bia.id })[0]!.conversationId).toBe(group.id);

    expect(t!.hub.squads.contextSection(t!.hub.botService.get(max.id))).toMatch(/hand it to the squad \(team\.handoff to its @handle\) so it works in its own chat/);
    expect(t!.hub.squads.contextSection(t!.hub.botService.get(ana.id))).toMatch(/comes to you in your squad's chat/);
  });
});
