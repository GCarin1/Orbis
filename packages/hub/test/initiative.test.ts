// specs/bots — a bot's initiative (change 0060-bot-initiative): off until the user turns it on; a bot quiet
// for long enough writes on its own, now and then, never in quiet hours nor when everyone's initiative is
// off, not again before the user answers, at most its daily count; `[silent]` posts nothing and a failure
// says nothing; "try it now" gives it the chance at once.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineItem } from "@orbis/shared";
import { inQuietHours, RHYTHM } from "../src/initiative/service.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const HOUR = 60 * 60 * 1000;

/**
 * A hub on a clock the test moves, from now (messages and runs keep the real time); no quiet hours unless
 * the test sets them.
 */
async function hubAt(start: string, dice = 0) {
  let now = start === "now" ? new Date() : new Date(start);
  t = await testHub({ clock: () => now, random: () => dice });
  await t.api("PUT", "/api/v1/initiative", { quietStart: "00:00", quietEnd: "00:00" });
  return { t, advance: (ms: number) => (now = new Date(now.getTime() + ms)), at: () => now };
}

async function messages(conversationId: string): Promise<TimelineItem[]> {
  return ((await t!.api("GET", `/api/v1/conversations/${conversationId}/items`)).body as TimelineItem[]).filter((i) => i.kind === "message");
}

describe("a bot's initiative", () => {
  it("is off until the user turns it on, then writes once quiet for long enough, and not again before an answer", async () => {
    const clock = await hubAt("now");
    const ana = await createBot(t!, { name: "Ana" });
    // Bia keeps hers off: she never writes on her own.
    const bia = await createBot(t!, { name: "Bia" });
    expect(bia.initiative).toEqual({ enabled: false, frequency: "normal", mcpUpdates: true });

    const on = await t!.api("PATCH", `/api/v1/bots/${ana.id}`, { initiative: { enabled: true, frequency: "often" } });
    expect(on.body.initiative).toEqual({ enabled: true, frequency: "often", mcpUpdates: true });
    // Quiet for less than its rhythm asks: nothing yet.
    const conv = (await t!.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    await chat(t!, ana.id, "oi");
    clock.advance(RHYTHM.often.idleMs - HOUR);
    expect(t!.hub.initiative.tick()).toEqual([]);

    clock.advance(2 * HOUR);
    const started = t!.hub.initiative.tick();
    expect(started.map((r) => r.botId)).toEqual([ana.id]);
    const [run] = started;
    expect(run).toMatchObject({ botId: ana.id, conversationId: conv.id, trigger: { type: "initiative", ref: "idle" } });
    expect(run!.input).toMatch(/^\[Your initiative\] Nobody has written in your conversation with the user for 3 hours/);
    expect(run!.input).toContain("answer exactly [silent]");
    const done = await t!.hub.engine.wait(run!.id);
    expect(done.status).toBe("done");
    const posted = await messages(conv.id);
    expect(posted.at(-1)).toMatchObject({ author: { type: "bot", id: ana.id }, runId: run!.id });

    // The user has not answered: no other message on top of it, however long the quiet.
    clock.advance(10 * HOUR);
    expect(t!.hub.initiative.tick()).toEqual([]);
    await chat(t!, ana.id, "bom dia");
    clock.advance(RHYTHM.often.idleMs + HOUR);
    expect(t!.hub.initiative.tick()).toHaveLength(1);
    await t!.hub.engine.idle();
  });

  it("writes at most its daily count, and only on the ticks the dice allow", async () => {
    const clock = await hubAt("now", 0.9);
    const ana = await createBot(t!, { name: "Ana", initiative: { enabled: true, frequency: "rare" } });
    clock.advance(RHYTHM.rare.idleMs + HOUR);
    // An unlucky roll: not this time.
    expect(t!.hub.initiative.tick()).toEqual([]);
    await t!.hub.close();
    // A lucky one, the next time.
    const lucky = await hubAt("now", 0);
    const bia = await createBot(t!, { name: "Bia", initiative: { enabled: true, frequency: "rare" } });
    lucky.advance(RHYTHM.rare.idleMs + HOUR);
    expect(t!.hub.initiative.tick()).toHaveLength(1);
    await t!.hub.engine.idle();
    await chat(t!, bia.id, "ok");
    // Rare: once a day at most, even after the user answered.
    lucky.advance(RHYTHM.rare.idleMs + HOUR);
    expect(t!.hub.initiative.tick()).toEqual([]);
    expect(ana).toBeTruthy();
  });

  it("stays silent in quiet hours, when everyone's initiative is off, and checks the settings", async () => {
    // 05:00 UTC is 02:00 in São Paulo.
    const clock = await hubAt("2036-10-07T05:00:00Z");
    await createBot(t!, { name: "Ana", initiative: { enabled: true, frequency: "often" } });
    clock.advance(0);
    const settings = await t!.api("PUT", "/api/v1/initiative", { timezone: "America/Sao_Paulo", quietStart: "22:00", quietEnd: "08:00" });
    expect(settings.body).toEqual({ enabled: true, quietStart: "22:00", quietEnd: "08:00", timezone: "America/Sao_Paulo" });
    clock.advance(3 * HOUR);
    // 05:00 in São Paulo: still quiet.
    expect(t!.hub.initiative.tick()).toEqual([]);
    clock.advance(4 * HOUR);
    // 09:00 there, but everyone's initiative is off.
    await t!.api("PUT", "/api/v1/initiative", { enabled: false });
    expect(t!.hub.initiative.tick()).toEqual([]);
    await t!.api("PUT", "/api/v1/initiative", { enabled: true });
    expect(t!.hub.initiative.tick()).toHaveLength(1);
    await t!.hub.engine.idle();

    expect((await t!.api("PUT", "/api/v1/initiative", { quietStart: "25:00" })).body.error.fields.quietStart).toBe("a time as HH:MM");
    expect((await t!.api("PUT", "/api/v1/initiative", { timezone: "Mars/Olympus" })).status).toBe(400);
    expect(inQuietHours({ enabled: true, quietStart: "13:00", quietEnd: "14:00", timezone: "UTC" }, new Date("2026-10-07T13:30:00Z"))).toBe(true);
    expect(inQuietHours({ enabled: true, quietStart: "09:00", quietEnd: "09:00", timezone: "UTC" }, new Date("2026-10-07T09:00:00Z"))).toBe(false);
  });

  it("posts nothing for [silent], says nothing of a failure, and counts neither", async () => {
    await hubAt("2036-10-07T15:00:00Z");
    const ana = await createBot(t!, { name: "Ana", initiative: { enabled: true } });
    const conv = (await t!.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    const quiet = t!.hub.initiative.wake(t!.hub.botService.get(ana.id), "idle", "/reply [silent]")!;
    expect((await t!.hub.engine.wait(quiet.id)).status).toBe("done");
    expect(await messages(conv.id)).toEqual([]);

    // A bot whose brain cannot run: its run fails, and the conversation says nothing.
    const broken = await createBot(t!, { name: "Bia", brain: { kind: "anthropic", model: "claude-opus-5" }, initiative: { enabled: true } });
    const failed = t!.hub.initiative.wake(t!.hub.botService.get(broken.id), "idle", "oi")!;
    expect((await t!.hub.engine.wait(failed.id)).status).toBe("failed");
    const bconv = (await t!.api("GET", `/api/v1/bots/${broken.id}/conversation`)).body;
    expect((await t!.api("GET", `/api/v1/conversations/${bconv.id}/items`)).body).toEqual([]);
    const counted = t!.hub.db.prepare("SELECT COUNT(*) AS n FROM initiatives WHERE posted = 1").get() as { n: number };
    expect(counted.n).toBe(0);
  });

  it("gives the bot its chance at once with Try it now", async () => {
    await hubAt("2036-10-07T15:00:00Z");
    const ana = await createBot(t!, { name: "Ana" });
    const now = await t!.api("POST", `/api/v1/bots/${ana.id}/initiative/now`);
    expect(now.status).toBe(202);
    expect(now.body.trigger).toEqual({ type: "initiative", ref: "test" });
    await t!.hub.engine.idle();
    // While it works, it waits: a second chance right after the first finds it busy.
    const bot = t!.hub.botService.get(ana.id);
    const first = t!.hub.initiative.wake(bot, "test", "/reply ok");
    expect(first).not.toBeNull();
    expect(t!.hub.initiative.wake(bot, "test", "/reply again")).toBeNull();
    const active = vi.spyOn(t!.hub.engine, "activeRuns").mockReturnValue([first!]);
    const busy = await t!.api("POST", `/api/v1/bots/${ana.id}/initiative/now`);
    expect(busy.status).toBe(409);
    expect(busy.body.error.message).toBe("Ana is working: try again when it is done");
    active.mockRestore();
    await t!.hub.engine.idle();
  });
});
