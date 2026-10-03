// specs/squads — bots organized in squads: a name and a handle, one squad per bot, a representative among
// the members and a manager outside them (one for every squad, too); who reports to whom follows; each squad
// gets its group and the representatives and managers a room; @squad reaches its representative in a
// message or a handoff; bots know their squads; and any bot calls another bot's enabled routine.
import { afterEach, describe, expect, it } from "vitest";
import type { Bot, Conversation, Run, SquadsView } from "@orbis/shared";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const bot = async (id: string) => (await t!.api("GET", `/api/v1/bots/${id}`)).body as Bot;
const conv = async (id: string) => (await t!.api("GET", `/api/v1/conversations/${id}`)).body as Conversation;
const squads = async () => (await t!.api("GET", "/api/v1/squads")).body as SquadsView;
const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;

describe("a squad", () => {
  it("holds its bots under a name and a handle, with a representative they report to and a manager it reports to", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", role: "Analyst" });
    const bob = await createBot(t, { name: "Bob", role: "Dev" });
    const cai = await createBot(t, { name: "Caio", role: "QA" });
    const max = await createBot(t, { name: "Max", role: "Director" });
    const created = await t.api("POST", "/api/v1/squads", {
      name: "Growth",
      description: "Grow the user base",
      members: [ana.id, "bob", "@caio"],
      managerId: max.id,
    });
    expect(created.status).toBe(201);
    const growth = (created.body as SquadsView).squads[0]!;
    // The first member (by name) represents it until the user picks another.
    expect(growth).toMatchObject({ name: "Growth", handle: "growth", members: [ana.id, bob.id, cai.id], representativeId: ana.id, managerId: max.id });
    expect((await bot(bob.id)).reportsTo).toBe(ana.id);
    expect((await bot(ana.id)).reportsTo).toBe(max.id);
    expect((await bot(ana.id)).squadId).toBe(growth.id);
    expect(t.events.some((e) => e.type === "squads.updated")).toBe(true);

    // A new representative: the others report to it, it reports to the manager.
    await t.api("PATCH", `/api/v1/squads/${growth.id}`, { representativeId: bob.id });
    expect([(await bot(ana.id)).reportsTo, (await bot(bob.id)).reportsTo, (await bot(cai.id)).reportsTo]).toEqual([bob.id, max.id, bob.id]);

    // Leaving the squad leaves its line too; joining another squad moves a bot.
    await t.api("DELETE", `/api/v1/squads/${growth.id}/members/${cai.id}`);
    expect(await bot(cai.id)).toMatchObject({ squadId: null, reportsTo: null });
    const data = (await t.api("POST", "/api/v1/squads", { name: "Data", members: [cai.id] })).body as SquadsView;
    const dataSquad = data.squads.find((s) => s.name === "Data")!;
    await t.api("PUT", `/api/v1/squads/${dataSquad.id}/members/${ana.id}`);
    const after = await squads();
    expect(after.squads.find((s) => s.id === growth.id)!.members).toEqual([bob.id]);
    expect(after.squads.find((s) => s.id === dataSquad.id)).toMatchObject({ members: [ana.id, cai.id], representativeId: cai.id });
    expect((await bot(ana.id)).reportsTo).toBe(cai.id);

    // One manager for every squad.
    await t.api("POST", "/api/v1/squads/manager", { managerId: max.id });
    expect((await squads()).squads.map((s) => s.managerId)).toEqual([max.id, max.id]);
    expect((await bot(cai.id)).reportsTo).toBe(max.id);

    // A renamed squad gets a new handle; a deleted one lets its bots go.
    await t.api("PATCH", `/api/v1/squads/${dataSquad.id}`, { name: "Data & BI" });
    expect((await squads()).squads.find((s) => s.id === dataSquad.id)!.handle).toBe("data-bi");
    await t.api("DELETE", `/api/v1/squads/${dataSquad.id}`);
    expect(await bot(ana.id)).toMatchObject({ squadId: null, reportsTo: null });
    expect(await bot(cai.id)).toMatchObject({ squadId: null, reportsTo: null });
  });

  it("refuses a manager inside the squad, a representative outside it and a loop of managers", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const cai = await createBot(t, { name: "Caio" });
    const one = ((await t.api("POST", "/api/v1/squads", { name: "One", members: [ana.id] })).body as SquadsView).squads[0]!;
    const refused = async (body: object) => (await t!.api("PATCH", `/api/v1/squads/${one.id}`, body)).body.error;
    expect((await refused({ managerId: ana.id })).fields.managerId).toContain("is in this squad");
    expect((await refused({ representativeId: bob.id })).fields.representativeId).toContain("is not in this squad");
    // Two squads managed by each other's representative would make everyone report to themselves.
    const two = ((await t.api("POST", "/api/v1/squads", { name: "Two", members: [bob.id], managerId: ana.id })).body as SquadsView).squads[1]!;
    expect((await refused({ managerId: bob.id })).fields.managerId).toContain("report to itself");
    expect((await squads()).squads.find((s) => s.id === one.id)!.managerId).toBeNull();
    // A squad's manager cannot join it, and the handle of a squad never takes a bot's handle or role.
    expect((await t.api("PUT", `/api/v1/squads/${two.id}/members/${ana.id}`)).status).toBe(400);
    expect(((await t.api("POST", "/api/v1/squads", { name: "Caio" })).body as SquadsView).squads[2]!.handle).toBe("caio-squad");
    expect(cai.handle).toBe("caio");
  });

  it("gives each squad its group from two members, and the representatives and managers a room", async () => {
    t = await testHub();
    const [ana, bob, cai, dan, max] = await Promise.all(["Ana", "Bob", "Caio", "Dan", "Max"].map((name) => createBot(t!, { name })));
    const one = ((await t.api("POST", "/api/v1/squads", { name: "Growth", members: [ana.id] })).body as SquadsView).squads[0]!;
    expect(one.conversationId).toBeNull();
    let view = (await t.api("PUT", `/api/v1/squads/${one.id}/members/${bob.id}`)).body as SquadsView;
    const groupId = view.squads[0]!.conversationId!;
    expect(await conv(groupId)).toMatchObject({ kind: "group", title: "Growth", members: [ana.id, bob.id], leadBotId: ana.id });
    await t.api("PATCH", `/api/v1/squads/${one.id}`, { name: "Growth Team", representativeId: bob.id });
    expect(await conv(groupId)).toMatchObject({ title: "Growth Team", leadBotId: bob.id });

    view = (await t.api("POST", "/api/v1/squads", { name: "Data", members: [cai.id, dan.id], managerId: max.id })).body as SquadsView;
    expect(view.roomId).not.toBeNull();
    expect((await conv(view.roomId!)).members.sort()).toEqual([bob.id, cai.id, max.id].sort());
    await t.api("DELETE", `/api/v1/squads/${one.id}/members/${ana.id}`);
    expect((await conv(groupId)).members).toEqual([bob.id]);
  });

  it("finds a new representative when the old one is deleted, and forgets a deleted manager", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const max = await createBot(t, { name: "Max" });
    const squad = ((await t.api("POST", "/api/v1/squads", { name: "Growth", members: [ana.id, bob.id], managerId: max.id })).body as SquadsView).squads[0]!;
    expect((await t.api("DELETE", `/api/v1/bots/${ana.id}`)).status).toBe(204);
    expect((await squads()).squads[0]).toMatchObject({ members: [bob.id], representativeId: bob.id, managerId: max.id });
    expect((await bot(bob.id)).reportsTo).toBe(max.id);
    await t.api("DELETE", `/api/v1/bots/${max.id}`);
    expect((await squads()).squads[0]!.managerId).toBeNull();
    expect((await bot(bob.id)).reportsTo).toBeNull();
    expect(squad.handle).toBe("growth");
  });
});

describe("squads working together", () => {
  it("reaches a squad's representative by @squad in a message and in a handoff, and tells bots their squads", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", role: "Analyst" });
    const bob = await createBot(t, { name: "Bob", role: "Dev" });
    const cai = await createBot(t, { name: "Caio", role: "QA" });
    const max = await createBot(t, { name: "Max", role: "Director" });
    await t.api("POST", "/api/v1/squads", { name: "Growth", members: [ana.id, bob.id], managerId: max.id, description: "Grow the user base" });
    const view = (await t.api("POST", "/api/v1/squads", { name: "Data", members: [cai.id], managerId: max.id })).body as SquadsView;

    // In the room, @data wakes Data's representative.
    const posted = await t.api("POST", `/api/v1/conversations/${view.roomId}/messages`, { text: "@data /reply on it" });
    const runs = await Promise.all(posted.body.runs.map((r: { id: string }) => t!.hub.engine.wait(r.id)));
    expect(runs.map((r: Run) => r.botId)).toEqual([cai.id]);

    // A handoff to @growth reaches Ana, its representative.
    const { runs: handed } = await chat(t, max.id, tool("team.handoff", { to: "@growth", task: "/reply numbers ready", returnResult: false }));
    expect(handed[0]!.steps.find((s) => s.type === "tool_result")).toMatchObject({ isError: false });
    const growthRun = t.hub.repos.runs.list({ botId: ana.id }).find((r) => r.trigger.type === "handoff")!;
    await t.hub.engine.wait(growthRun.id);
    expect(growthRun.input).toContain("numbers ready");

    // Each bot knows its squad, the others and how to reach them.
    const context = t.hub.squads.contextSection(t.hub.botService.get(ana.id))!;
    expect(context).toContain('You are in the squad "Growth" (@growth). Its representative is you; its manager is @max.');
    expect(context).toContain('Other squads: "Data" (@data): representative @caio, 1 bots');
    expect(context).toContain("You speak for your squad");
    expect(t.hub.squads.contextSection(t.hub.botService.get(max.id))).toContain(
      'You manage the squads "Growth" (@growth, representative @ana), "Data" (@data, representative @caio)',
    );
    const { runs: listed } = await chat(t, bob.id, `${tool("team.list_squads", {})}\n${tool("team.list_bots", {})}`);
    const outputs = listed[0]!.steps.filter((s) => s.type === "tool_result").map((s) => (s as { output: string }).output);
    expect(JSON.parse(outputs[0]!)).toContainEqual({
      name: "Data",
      handle: "data",
      description: "",
      representative: "caio",
      manager: "max",
      members: ["caio"],
    });
    expect(JSON.parse(outputs[1]!)).toContainEqual(expect.objectContaining({ handle: "bob", squad: "growth" }));
  });

  it("lets a bot call another bot's enabled routine, gets its answer back, and the routine says who called it", async () => {
    t = await testHub();
    const lia = await createBot(t, { name: "Lia", role: "Data" });
    const max = await createBot(t, { name: "Max" });
    const make = async (name: string, instruction: string) =>
      (await t!.api("POST", `/api/v1/bots/${lia.id}/routines`, { name, trigger: { type: "cron", cron: "0 9 * * 1", timezone: "UTC" }, instruction })).body;
    const weekly = await make("Weekly report", "Build the weekly report");
    const draft = await make("Draft", "not tested");
    await t.api("POST", `/api/v1/routines/${weekly.id}/enable`, { force: true });

    const { conversation, runs } = await chat(
      t,
      max.id,
      [
        tool("routine.list", { bot: "all" }),
        tool("routine.call", { routine: "@lia/draft" }),
        tool("routine.call", { routine: "@lia/nope" }),
        tool("routine.call", { routine: "@lia/weekly report", note: "only Brazil" }),
      ].join("\n"),
    );
    const results = runs[0]!.steps.filter((s) => s.type === "tool_result") as Array<{ output: string; isError: boolean }>;
    // Only enabled routines are offered to others: "Draft" is not.
    expect(results[0]!.output).toMatch(new RegExp(`^@lia/Weekly report \\(${weekly.id}\\): .+ — Build the weekly report$`));
    expect(results[1]).toMatchObject({ isError: true, output: 'the routine "Draft" of @lia is disabled: only enabled (tested) routines can be called' });
    expect(results[2]).toMatchObject({ isError: true });
    expect(results[2]!.output).toContain('@lia has no routine "nope"');
    expect(results[3]).toMatchObject({ isError: false });
    expect(draft.name).toBe("Draft");

    // Lia runs her routine in Max's conversation, then Max hears back.
    const liaRun = t.hub.repos.runs.list({ botId: lia.id }).find((r) => r.trigger.type === "handoff")!;
    await t.hub.engine.wait(liaRun.id);
    expect(liaRun.conversationId).toBe(conversation.id);
    expect(liaRun.input).toContain('@max called your routine "Weekly report". Do this now:\n\nBuild the weekly report');
    expect(liaRun.input).toContain("What @max needs from this run:\n\nonly Brazil");
    const report = await (async () => {
      for (let i = 0; i < 50; i++) {
        const found = t!.hub.repos.runs.list({ botId: max.id }).find((r) => r.trigger.type === "report");
        if (found) return t!.hub.engine.wait(found.id);
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("no report");
    })();
    expect(report.input).toContain("@lia (Lia, Data)");
    const routine = (await t.api("GET", `/api/v1/routines/${weekly.id}`)).body;
    expect(routine.lastRun).toMatchObject({ runId: liaRun.id, calledBy: max.id, status: "done" });

    // A bot does not call its own routine.
    const own = await chat(t, lia.id, tool("routine.call", { routine: weekly.id }));
    expect(own.runs[0]!.steps.find((s) => s.type === "tool_result")).toMatchObject({
      isError: true,
      output: '"Weekly report" is your own routine: do its instruction yourself',
    });
  });
});
