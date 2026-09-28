// specs/bots (hierarchy), specs/handoff (one report back per delegating run),
// specs/conversations (mentions by role, bots bringing each other in) —
// change 0014-team-hierarchy.
import { afterEach, describe, expect, it } from "vitest";
import type { Run, TimelineItem } from "@orbis/shared";
import { Collaboration } from "../src/collab/handoff.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const handoff = (args: Record<string, unknown>) => `/tool team.handoff ${JSON.stringify(args)}`;
const runsOf = (t: TestHub, botId: string): Run[] => t.hub.repos.runs.list({ botId }).reverse();
const items = async (t: TestHub, conversationId: string): Promise<TimelineItem[]> =>
  (await t.api("GET", `/api/v1/conversations/${conversationId}/items?limit=200`)).body;

/** A chief of staff with a designer and a QA reporting to it. */
async function team(t: TestHub) {
  const chief = await createBot(t, { name: "Chief", role: "Chief of Staff" });
  const designer = await createBot(t, { name: "Dana", role: "Designer", reportsTo: "@chief" });
  const qa = await createBot(t, { name: "Quinn", role: "QA", reportsTo: chief.id });
  return { chief, designer, qa };
}

describe("hierarchy", () => {
  it("records who a bot reports to and refuses itself, a loop or an unknown manager", async () => {
    t = await testHub();
    const { chief, designer, qa } = await team(t);
    expect(designer.reportsTo).toBe(chief.id);
    expect(qa.reportsTo).toBe(chief.id);
    expect(chief.reportsTo).toBeNull();

    const self = await t.api("PATCH", `/api/v1/bots/${chief.id}`, { reportsTo: "@chief" });
    expect(self.status).toBe(400);
    expect(self.body.error.fields.reportsTo).toBe("a bot cannot report to itself");
    const loop = await t.api("PATCH", `/api/v1/bots/${chief.id}`, { reportsTo: designer.id });
    expect(loop.status).toBe(400);
    expect(loop.body.error.fields.reportsTo).toBe("@dana already reports to this bot");
    const unknown = await t.api("PATCH", `/api/v1/bots/${chief.id}`, { reportsTo: "@nobody" });
    expect(unknown.status).toBe(400);

    const cleared = await t.api("PATCH", `/api/v1/bots/${qa.id}`, { reportsTo: null });
    expect(cleared.body.reportsTo).toBeNull();
    const copy = await t.api("POST", `/api/v1/bots/${designer.id}/duplicate`);
    expect(copy.body.reportsTo).toBe(chief.id);
  });

  it("moves a deleted manager's reports up to its own manager", async () => {
    t = await testHub();
    const ceo = await createBot(t, { name: "Ceo", role: "CEO" });
    const chief = await createBot(t, { name: "Chief", role: "Chief of Staff", reportsTo: ceo.id });
    const designer = await createBot(t, { name: "Dana", role: "Designer", reportsTo: chief.id });
    await t.api("DELETE", `/api/v1/bots/${chief.id}`);
    expect(t.hub.repos.bots.get(designer.id)!.reportsTo).toBe(ceo.id);
    expect(t.events.some((e) => e.type === "bot.updated" && (e.data as { bot: { id: string; reportsTo: string } }).bot.id === designer.id)).toBe(true);
  });

  it("tells each bot its manager, its reports and its colleagues", async () => {
    t = await testHub();
    const { chief, designer } = await team(t);
    await createBot(t, { name: "Olga", role: "Operations" });
    const collab = new Collaboration(t.hub);
    const lead = collab.contextSection(t.hub.repos.bots.get(chief.id)!)!;
    expect(lead).toContain("- Your reports: @dana (Dana, Designer); @quinn (Quinn, QA).");
    expect(lead).toContain("- Colleagues: @olga (Olga, Operations).");
    expect(lead).toContain("delegate each part to the report whose role fits with team.handoff");
    const report = collab.contextSection(t.hub.repos.bots.get(designer.id)!)!;
    expect(report).toContain("- You report to @chief (Chief, Chief of Staff).");
    expect(report).toContain("When @chief hands you work, do it and answer with the result");
  });
});

describe("delegation with one report back", () => {
  it("wakes the manager once, after every delegated task ended, with all answers and failures", async () => {
    t = await testHub();
    const { chief, designer, qa } = await team(t);
    const { conversation, runs } = await chat(
      t,
      chief.id,
      [handoff({ to: "@designer", task: "/sleep 150\n/reply banner ready" }), handoff({ to: "@quinn", task: "/fail browser crashed" })].join("\n"),
    );
    expect(runs[0].status).toBe("done");
    await t.hub.engine.idle();

    const chiefRuns = runsOf(t, chief.id);
    expect(chiefRuns).toHaveLength(2);
    const report = chiefRuns[1]!;
    expect(report).toMatchObject({ status: "done", trigger: { type: "report", ref: runs[0].id }, conversationId: conversation.id });
    expect(report.input).toContain("All 2 tasks you handed off have ended.");
    expect(report.input).toContain('@dana (Dana, Designer) — "/sleep 150\n/reply banner ready" — done. Answer:\nbanner ready');
    expect(report.input).toContain('@quinn (Quinn, QA) — "/fail browser crashed" — failed: browser crashed');

    const timeline = await items(t, conversation.id);
    const cards = timeline.filter((i) => i.card?.type === "handoff");
    expect(cards.map((c) => c.card!.state)).toEqual(["done", "failed"]);
    expect(cards.every((c) => c.card!.data.reportRunId === report.id)).toBe(true);
    // The report is a new message to the user, not a thread reply.
    const said = timeline.find((i) => i.runId === report.id && i.kind === "message")!;
    expect(said.parentId).toBeNull();
    const event = t.events.find((e) => e.type === "bot.report")!;
    expect(event.data).toMatchObject({ botId: chief.id, conversationId: conversation.id, itemId: said.id });
    // The report names the team, and starts no one again.
    expect(runsOf(t, designer.id)).toHaveLength(1);
    expect(runsOf(t, qa.id)).toHaveLength(1);
  });

  it("delegates by role, and refuses a role several bots hold", async () => {
    t = await testHub();
    const { chief, designer } = await team(t);
    await chat(t, chief.id, handoff({ to: "@designer", task: "/reply done", returnResult: false }));
    await t.hub.engine.idle();
    expect(runsOf(t, designer.id)[0]).toMatchObject({ trigger: { type: "handoff" }, reply: "done" });

    await createBot(t, { name: "Quincy", role: "QA" });
    const { runs } = await chat(t, chief.id, handoff({ to: "@qa", task: "test" }));
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result")).toMatchObject({
      isError: true,
      output: "several bots have the role @qa: @quincy, @quinn; name one handle",
    });
  });
});

describe("bots bringing each other in", () => {
  it("starts a colleague mentioned by role in a bot's reply in a direct conversation", async () => {
    // Depth 1: the mock brain echoes, so the colleague's echo would mention the chief back.
    t = await testHub({ config: { maxHandoffDepth: 1 } });
    const { chief, designer } = await team(t);
    const { conversation } = await chat(t, chief.id, "/reply I asked @designer to draft the banner");
    await t.hub.engine.idle();
    const dana = runsOf(t, designer.id);
    expect(dana).toHaveLength(1);
    expect(dana[0]).toMatchObject({ conversationId: conversation.id, trigger: { type: "mention" }, depth: 1 });
    expect(dana[0]!.input).toBe("[@chief] I asked @designer to draft the banner");
    const timeline = await items(t, conversation.id);
    expect(timeline.some((i) => i.runId === dana[0]!.id && i.author.id === designer.id)).toBe(true);
  });

  it("does not start a colleague the same run handed work to", async () => {
    t = await testHub();
    const { chief, designer } = await team(t);
    await chat(t, chief.id, [handoff({ to: "@dana", task: "/reply ok", returnResult: false }), "@dana is on it"].join("\n"));
    await t.hub.engine.idle();
    expect(runsOf(t, designer.id).map((r) => r.trigger.type)).toEqual(["handoff"]);
  });

  it("runs the bots a user mentions by role in a group, members or not", async () => {
    t = await testHub();
    const { chief, designer, qa } = await team(t);
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Launch", members: [chief.id, designer.id] })).body;
    const posted = await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@qa please check the checkout" });
    expect(posted.body.runs.map((r: { botId: string }) => r.botId)).toEqual([qa.id]);
  });
});
