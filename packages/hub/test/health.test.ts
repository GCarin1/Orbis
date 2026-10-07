// specs/health — the user's health data (change 0062-health-connect): the phone's sync is kept (each day's
// values replace that day's, workouts by id), checked, summed up and wiped; only the bots given `health.*`
// get the health tools — `*` never does — and read a table of their days and their workouts.
import { afterEach, describe, expect, it } from "vitest";
import type { HealthStatus } from "@orbis/shared";
import { shown } from "../src/health/service.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const results = (run: { steps: Array<{ type: string; output?: string; isError?: boolean }> }) => run.steps.filter((s) => s.type === "tool_result");

describe("the phone's health sync", () => {
  it("keeps each day's values, replaces a day sent again, keeps workouts by id, and wipes everything", async () => {
    t = await testHub();
    const first = await t.api("PUT", "/api/v1/health/sync", {
      days: [
        { date: daysAgo(1), metrics: { steps: 8000, sleep_minutes: 420, resting_heart_rate: 58 } },
        { date: today, metrics: { steps: 1200 } },
      ],
      sessions: [{ id: "run-1", start: `${daysAgo(1)}T07:00:00Z`, end: `${daysAgo(1)}T07:40:00Z`, type: "running", title: "Morning run", source: "com.huami.watch.hmwatchmanager" }],
      sources: ["com.huami.watch.hmwatchmanager"],
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ days: 2, firstDate: daysAgo(1), lastDate: today, sources: ["com.huami.watch.hmwatchmanager"], bots: [] } satisfies Partial<HealthStatus>);
    expect(first.body.lastSyncAt).toBeTruthy();

    // Today again, later: its steps are replaced, the other day stays.
    await t.api("PUT", "/api/v1/health/sync", { days: [{ date: today, metrics: { steps: 5400 } }], sources: ["com.sec.android.app.shealth"] });
    const summary = (await t.api("GET", "/api/v1/health/summary?days=7")).body;
    expect(summary.days).toEqual([
      { date: today, metrics: { steps: 5400 } },
      { date: daysAgo(1), metrics: { steps: 8000, sleep_minutes: 420, resting_heart_rate: 58 } },
    ]);
    expect(summary.sessions).toEqual([{ id: "run-1", start: `${daysAgo(1)}T07:00:00.000Z`, end: `${daysAgo(1)}T07:40:00.000Z`, type: "running", title: "Morning run", source: "com.huami.watch.hmwatchmanager" }]);
    expect((await t.api("GET", "/api/v1/health/status")).body.sources).toEqual(["com.sec.android.app.shealth", "com.huami.watch.hmwatchmanager"]);

    expect((await t.api("DELETE", "/api/v1/health")).status).toBe(204);
    expect((await t.api("GET", "/api/v1/health/status")).body).toEqual({ lastSyncAt: null, days: 0, firstDate: null, lastDate: null, sources: [], bots: [] });
  });

  it("refuses a bad date, an unknown metric, a negative value and too many days", async () => {
    t = await testHub();
    const bad = async (days: unknown) => (await t!.api("PUT", "/api/v1/health/sync", { days })).body.error.fields;
    expect(await bad([{ date: "07/10/2026", metrics: {} }])).toEqual({ "days.0.date": "a date as YYYY-MM-DD" });
    expect(await bad([{ date: today, metrics: { mood: 3 } }])).toEqual({ [`days.0.metrics.mood`]: "not a metric Orbis keeps" });
    expect(await bad([{ date: today, metrics: { steps: -1 } }])).toEqual({ [`days.0.metrics.steps`]: "a number, 0 or more" });
    const many = Array.from({ length: 121 }, (_, i) => ({ date: daysAgo(i), metrics: { steps: 1 } }));
    expect((await t.api("PUT", "/api/v1/health/sync", { days: many })).status).toBe(400);
  });
});

describe("the health tools", () => {
  it("reach only the bots given health.*, and read a table of their days and their workouts", async () => {
    t = await testHub();
    await t.api("PUT", "/api/v1/health/sync", {
      days: [{ date: daysAgo(1), metrics: { steps: 8000, distance_m: 6200, sleep_minutes: 425, resting_heart_rate: 58.4 } }],
      sessions: [{ id: "w1", start: `${daysAgo(1)}T18:00:00Z`, end: `${daysAgo(1)}T18:45:00Z`, type: "strength_training", title: null, source: "com.google.android.apps.fitness" }],
      sources: ["com.google.android.apps.fitness"],
    });
    // Every tool but these: `*` never gives the health data.
    const ana = await createBot(t, { name: "Ana", tools: ["*"] });
    expect(t.hub.gateway.toolsFor(t.hub.botService.get(ana.id)).map((x) => x.name)).not.toContain("health.summary");
    const refused = await chat(t, ana.id, "/tool health.summary {}");
    expect(results(refused.runs[0]!)[0]!.isError).toBe(true);

    const given = await t.api("POST", "/api/v1/health/bots", { botId: ana.id, enabled: true });
    expect(given.body.tools).toEqual(["*", "health.*"]);
    expect((await t.api("GET", "/api/v1/health/status")).body.bots).toEqual([ana.id]);
    const { runs } = await chat(t, ana.id, `/tool health.summary {"days":7}`);
    const table = results(runs[0]!)[0]!.output!;
    expect(table).toContain("from com.google.android.apps.fitness");
    expect(table).toContain("| date | steps | distance | resting heart rate | sleep |");
    expect(table).toContain(`| ${daysAgo(1)} | 8000 | 6.2 km | 58.4 bpm | 7 h 5 min |`);
    const workouts = await chat(t, ana.id, `/tool health.sessions {}`);
    expect(results(workouts.runs[0]!)[0]!.output).toContain("strength_training · 45 min · com.google.android.apps.fitness");

    // Taken back: the tools go, the bot's other patterns stay.
    expect((await t.api("POST", "/api/v1/health/bots", { botId: ana.id, enabled: false })).body.tools).toEqual(["*"]);
    expect(t.hub.gateway.toolsFor(t.hub.botService.get(ana.id)).map((x) => x.name)).not.toContain("health.sessions");
    // The tool list says these need their own pattern.
    const tools = (await t.api("GET", "/api/v1/tools")).body as Array<{ name: string; explicit?: string }>;
    expect(tools.find((x) => x.name === "health.summary")?.explicit).toBe("health.");
  });

  it("says there is nothing yet, and shows values as people read them", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana", tools: ["*", "health.*"] });
    const { runs } = await chat(t, bot.id, "/tool health.summary {}");
    expect(results(runs[0]!)[0]!.output).toMatch(/^No health data yet: the user connects Health Connect in the Orbis app/);
    expect(shown("sleep_minutes", 45)).toBe("45 min");
    expect(shown("weight_kg", 72.36)).toBe("72.4 kg");
    expect(shown("distance_m", 850)).toBe("850 m");
    expect(shown("oxygen_saturation_avg", 97.2)).toBe("97.2 %");
  });
});
