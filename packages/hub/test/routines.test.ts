// specs/routines — acceptance criteria 1 to 5.
import { afterEach, describe, expect, it } from "vitest";
import type { Run, TimelineItem } from "@orbis/shared";
import { sign } from "../src/routines/service.js";
import { Collaboration } from "../src/collab/handoff.js";
import type { HubContext } from "../src/context.js";
import { chat, createBot, TOKEN, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

/** A settable clock for the scheduler. */
function clock(start: string) {
  let now = new Date(start);
  return { now: () => now, set: (iso: string) => void (now = new Date(iso)) };
}

const cron = (expr: string, timezone = "America/Sao_Paulo") => ({ type: "cron", cron: expr, timezone });

async function routine(t: TestHub, botId: string, body: Record<string, unknown> = {}) {
  const res = await t.api("POST", `/api/v1/bots/${botId}/routines`, { name: "Daily report", trigger: cron("0 9 * * *"), instruction: "/reply report sent", ...body });
  if (res.status !== 201) throw new Error(`create routine failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const items = async (t: TestHub, conversationId: string): Promise<TimelineItem[]> =>
  (await t.api("GET", `/api/v1/conversations/${conversationId}/items?limit=200`)).body;

async function webhook(t: TestHub, id: string, body: string, headers: Record<string, string>) {
  const res = await t.hub.app.inject({ method: "POST", url: `/hooks/routines/${id}`, payload: body, headers: { "content-type": "application/json", ...headers } });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

describe("routines", () => {
  it("creates, lists, edits and deletes routines; the 51st answers 409; only the last 20 runs are kept (criterion 1)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const created = await routine(t, bot.id);
    expect(created).toMatchObject({ botId: bot.id, name: "Daily report", trigger: cron("0 9 * * *"), approval: "normal", enabled: false, paused: false, webhookPath: null, lastRun: null });
    expect(created.secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // A routine card in the bot's direct conversation.
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    expect((await items(t, conv.id)).at(-1)).toMatchObject({ kind: "card", card: { type: "routine", state: "created", data: { routineId: created.id } } });

    const edited = await t.api("PATCH", `/api/v1/routines/${created.id}`, { name: "Morning report", trigger: { type: "webhook" }, approval: "draft_only" });
    expect(edited.body).toMatchObject({ name: "Morning report", trigger: { type: "webhook" }, approval: "draft_only", webhookPath: `/hooks/routines/${created.id}` });
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/routines`)).body.map((r: { id: string }) => r.id)).toEqual([created.id]);
    expect((await t.api("PATCH", `/api/v1/routines/${created.id}`, { trigger: cron("not a cron") })).status).toBe(400);
    const badZone = await t.api("POST", `/api/v1/bots/${bot.id}/routines`, { name: "x", trigger: cron("0 9 * * *", "Mars/Olympus"), instruction: "x" });
    expect(badZone.body.error.fields["trigger.timezone"]).toMatch(/not an IANA timezone/);

    // Only the newest 20 runs stay.
    for (let i = 0; i < 22; i++) await t.hub.engine.wait((await t.api("POST", `/api/v1/routines/${created.id}/test`)).body.runId);
    const runs = (await t.api("GET", `/api/v1/routines/${created.id}/runs`)).body;
    expect(runs).toHaveLength(20);
    expect(runs.every((r: { test: boolean; status: string }) => r.test && r.status === "done")).toBe(true);

    for (let i = 1; i < 50; i++) await routine(t, bot.id, { name: `r${i}` });
    const extra = await t.api("POST", `/api/v1/bots/${bot.id}/routines`, { name: "one too many", trigger: { type: "webhook" }, instruction: "x" });
    expect(extra.status).toBe(409);
    expect(extra.body.error.code).toBe("routine_limit");

    expect((await t.api("DELETE", `/api/v1/routines/${created.id}`)).status).toBe(204);
    expect((await t.api("GET", `/api/v1/routines/${created.id}`)).status).toBe(404);
  });

  it("fires a cron routine in America/Sao_Paulo at the matching local time under a fake clock (criterion 2)", async () => {
    const time = clock("2026-09-28T11:00:00Z"); // 08:00 in São Paulo (UTC-3)
    t = await testHub({ clock: time.now });
    const bot = await createBot(t);
    const r = await routine(t, bot.id);
    const enabled = await t.api("POST", `/api/v1/routines/${r.id}/enable`, { force: true });
    expect(enabled.body).toMatchObject({ enabled: true, nextRunAt: "2026-09-28T12:00:00.000Z" }); // 09:00 local

    const tick = (iso: string) => {
      time.set(iso);
      return t!.hub.routines.tick(time.now());
    };
    expect(tick("2026-09-28T11:59:30Z")).toEqual([]);
    expect(tick("2026-09-28T12:00:05Z")).toEqual([r.id]);
    expect(tick("2026-09-28T12:00:40Z")).toEqual([]); // once per fire time
    await t.hub.engine.idle();
    const runs = t.hub.repos.runs.list({ botId: bot.id }) as Run[];
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "done", trigger: { type: "routine", ref: r.id }, reply: "report sent" });
    expect(runs[0]!.input).toContain('Routine "Daily report" (cron "0 9 * * *" in America/Sao_Paulo). Do this now:\n\n/reply report sent');
    expect((await t.api("GET", `/api/v1/routines/${r.id}`)).body).toMatchObject({ nextRunAt: "2026-09-29T12:00:00.000Z", lastRun: { status: "done", test: false } });

    // Disabled: nothing fires.
    await t.api("POST", `/api/v1/routines/${r.id}/disable`);
    expect(tick("2026-09-29T12:00:05Z")).toEqual([]);
  });

  it("starts a run for a webhook with a valid signature, payload wrapped as untrusted; a bad signature answers 401 and starts nothing (criterion 3)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const r = await routine(t, bot.id, { name: "On push", trigger: { type: "webhook" }, instruction: "Summarise the push." });
    const body = JSON.stringify({ ref: "refs/heads/main", commits: 3 });

    // Not enabled yet: 404.
    expect((await webhook(t, r.id, body, { "x-orbis-signature": sign(r.secret, body) })).status).toBe(404);
    await t.api("POST", `/api/v1/routines/${r.id}/enable`, { force: true });

    const ok = await webhook(t, r.id, body, { "x-orbis-signature": sign(r.secret, body) });
    expect(ok.status).toBe(202);
    const run = await t.hub.engine.wait(ok.body.runId);
    expect(run.trigger).toEqual({ type: "webhook", ref: r.id });
    expect(run.input).toContain(`<untrusted-content source="webhook:On push">\n${body}\n</untrusted-content>`);

    const github = await webhook(t, r.id, body, { "x-hub-signature-256": sign(r.secret, body), "x-github-event": "push" });
    expect(github.status).toBe(202);
    expect((await t.hub.engine.wait(github.body.runId)).input).toContain("(event: push)");

    const before = t.hub.repos.runs.list({ botId: bot.id }).length;
    for (const headers of [{}, { "x-orbis-signature": sign("wrong-secret", body) }, { "x-orbis-signature": sign(r.secret, body + " ") }, { "x-hub-signature-256": "sha256=zz" }]) {
      expect((await webhook(t, r.id, body, headers)).status).toBe(401);
    }
    expect(t.hub.repos.runs.list({ botId: bot.id }).length).toBe(before);
    // The API token is not a webhook signature, and the hook needs none.
    expect((await webhook(t, r.id, body, { authorization: `Bearer ${TOKEN}` })).status).toBe(401);
  });

  it("refuses to enable a routine with no successful test run unless forced; a test runs draft-only (criterion 4)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const r = await routine(t, bot.id, { instruction: '/tool http.fetch {"url":"http://127.0.0.1:1/"}\n/reply checked' });
    const refused = await t.api("POST", `/api/v1/routines/${r.id}/enable`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("untested");

    const test = await t.api("POST", `/api/v1/routines/${r.id}/test`);
    expect(test.status).toBe(202);
    const run = await t.hub.engine.wait(test.body.runId);
    // External tools become drafts in a test run: nothing was fetched.
    const result = run.steps.find((s) => s.type === "tool_result")!;
    expect(result).toMatchObject({ isError: false, output: expect.stringMatching(/^draft-only routine: http.fetch did not run; the call is draft itm_/) });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const draft = (await items(t, conv.id)).find((i) => i.card?.type === "draft")!;
    expect(draft.card!.data).toMatchObject({ channel: "chat", to: "http.fetch", subject: 'Held by the draft-only routine "Daily report"' });
    expect((await t.api("GET", `/api/v1/routines/${r.id}/runs`)).body[0]).toMatchObject({ test: true, status: "done", summary: "checked" });

    const enabled = await t.api("POST", `/api/v1/routines/${r.id}/enable`);
    expect(enabled.status).toBe(200);
    expect(enabled.body.enabled).toBe(true);
    const states = (await items(t, conv.id)).filter((i) => i.card?.type === "routine").map((i) => i.card!.state);
    expect(states).toEqual(["created", "enabled"]);

    // A failed test does not count.
    const other = await routine(t, bot.id, { name: "Broken", instruction: "/fail nope" });
    await t.hub.engine.wait((await t.api("POST", `/api/v1/routines/${other.id}/test`)).body.runId);
    expect((await t.api("POST", `/api/v1/routines/${other.id}/enable`)).status).toBe(409);
    expect((await t.api("POST", `/api/v1/routines/${other.id}/enable`, { force: true })).status).toBe(200);
  });

  it("pauses scheduled routines and posts a card after the absence period (criterion 5)", async () => {
    const time = clock("2026-09-01T12:00:00Z");
    t = await testHub({ clock: time.now, config: { absencePauseDays: 14 } });
    const bot = await createBot(t); // an API change: the user is active now
    const daily = await routine(t, bot.id);
    const hook = await routine(t, bot.id, { name: "Hook", trigger: { type: "webhook" } });
    await t.api("POST", `/api/v1/routines/${daily.id}/enable`, { force: true });
    await t.api("POST", `/api/v1/routines/${hook.id}/enable`, { force: true });

    time.set("2026-09-14T12:00:00Z");
    expect(t.hub.routines.checkAbsence(time.now())).toEqual([]);
    time.set("2026-09-15T12:00:01Z");
    expect(t.hub.routines.tick(time.now())).toEqual([]); // paused before it could fire
    const after = (await t.api("GET", `/api/v1/bots/${bot.id}/routines`)).body;
    expect(after.find((r: { id: string }) => r.id === daily.id)).toMatchObject({ enabled: true, paused: true, nextRunAt: null });
    expect(after.find((r: { id: string }) => r.id === hook.id).paused).toBe(false); // webhooks are not scheduled
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const card = (await items(t, conv.id)).at(-1)!;
    expect(card).toMatchObject({ kind: "card", card: { type: "routine", state: "paused", data: { routineId: daily.id } } });
    expect(card.text).toMatch(/paused: no activity from you for 14 days/);

    // Enabling again resumes it.
    const resumed = await t.api("POST", `/api/v1/routines/${daily.id}/enable`, { force: true });
    expect(resumed.body).toMatchObject({ paused: false, nextRunAt: "2026-09-16T12:00:00.000Z" });
  });

  it("lets a bot create and list its own routines; creating asks the user first by default", async () => {
    t = await testHub();
    const bot = await createBot(t, { policy: { rules: [{ tool: "routine.create", decision: "allow" }], grants: [] } });
    const { runs } = await chat(t, bot.id, '/tool routine.create {"name":"Standup","instruction":"Post the standup","cron":"30 9 * * 1-5","timezone":"Europe/Lisbon"}\n/tool routine.list {}');
    const [created, listed] = runs[0].steps.filter((s: { type: string }) => s.type === "tool_result");
    expect(created.output).toMatch(/^created routine rtn_\w+ "Standup" \(cron "30 9 \* \* 1-5" in Europe\/Lisbon\), disabled/);
    expect(listed.output).toMatch(/"Standup": cron "30 9 \* \* 1-5" in Europe\/Lisbon, disabled/);

    const asking = await createBot(t, { name: "Bob" });
    const conv = (await t.api("GET", `/api/v1/bots/${asking.id}/conversation`)).body;
    await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool routine.create {"name":"x","instruction":"y","webhook":true}' });
    for (let i = 0; i < 100 && (await t.api("GET", "/api/v1/approvals?status=pending")).body.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect((await t.api("GET", "/api/v1/approvals?status=pending")).body[0]).toMatchObject({ tool: "routine.create", botId: asking.id });
  });

  it("lets a manager create routines for the bots below it, shown where it was asked, and for no one else (criterion 9)", async () => {
    t = await testHub();
    const allow = { policy: { rules: [{ tool: "routine.create", decision: "allow" }], grants: [] } };
    const camila = await createBot(t, { name: "Camila", role: "Gerente", ...allow });
    const rafael = await createBot(t, { name: "Rafael", role: "Analista", reportsTo: camila.id, ...allow });
    const lia = await createBot(t, { name: "Lia", role: "Estagiária", reportsTo: rafael.id });
    const peer = await createBot(t, { name: "Jorge", role: "Diretor" });
    const make = (bot: string, name: string) => `/tool routine.create {"name":"${name}","instruction":"Resumo do mercado","cron":"23 7 * * 1-5","timezone":"America/Sao_Paulo","bot":"${bot}"}`;
    const { runs, conversation } = await chat(t, camila.id, [make("@rafael", "Abertura"), make("lia", "Estudo"), make("jorge", "Nada"), make("camila", "Minha")].join("\n"));
    const [forReport, forGrandReport, forPeer, forSelf] = runs[0].steps.filter((s: { type: string }) => s.type === "tool_result");
    expect(forReport.output).toMatch(/^created routine rtn_\w+ "Abertura" for @rafael \(cron "23 7 \* \* 1-5" in America\/Sao_Paulo\), disabled/);
    expect(forGrandReport.output).toMatch(/"Estudo" for @lia/);
    expect(forPeer).toMatchObject({ isError: true });
    expect(forPeer.output).toMatch(/@jorge does not report to you/);
    expect(forSelf.output).toMatch(/^created routine rtn_\w+ "Minha" \(/);

    // The routine is the report's, its card in the report's chat and where the manager was asked.
    expect((await t.api("GET", `/api/v1/bots/${rafael.id}/routines`)).body).toMatchObject([{ name: "Abertura", botId: rafael.id, enabled: false }]);
    expect((await t.api("GET", `/api/v1/bots/${peer.id}/routines`)).body).toEqual([]);
    const rafaelChat = (await t.api("GET", `/api/v1/bots/${rafael.id}/conversation`)).body;
    const cards = (list: TimelineItem[]) => list.filter((i) => i.card?.type === "routine").map((i) => i.card!.data as { name: string; botId: string });
    expect(cards(await items(t, rafaelChat.id))).toEqual([expect.objectContaining({ name: "Abertura", botId: rafael.id })]);
    expect(cards(await items(t, conversation.id)).map((c) => c.name)).toEqual(["Abertura", "Estudo", "Minha"]);
    void lia;
  });

  it("tells a manager to schedule its reports' work with Orbis routines", async () => {
    t = await testHub();
    const camila = await createBot(t, { name: "Camila" });
    await createBot(t, { name: "Rafael", reportsTo: camila.id });
    const section = new Collaboration({ repos: t.hub.repos } as unknown as HubContext).contextSection(t.hub.repos.bots.get(camila.id)!)!;
    expect(section).toMatch(/routine\.create \(bot: its handle\)/);
    expect(section).toMatch(/never with another scheduler/);
    // And how mentions call colleagues: all the members named in a group, one or two elsewhere.
    expect(section).toMatch(/In a group, the members you name with @ are all called; elsewhere call one or two colleagues this way at most/);
  });
});
