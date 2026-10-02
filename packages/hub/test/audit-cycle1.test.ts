// Audit cycle 1 (change 0023-audit-cycle-1-routines-and-usage): routines and
// usage accounting, kept as regressions.
import { afterEach, describe, expect, it } from "vitest";
import type { TimelineItem } from "@orbis/shared";
import { mapCodexEvent, type CodexState } from "../src/brains/codex.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

function clock(start: string) {
  let now = new Date(start);
  return { now: () => now, set: (iso: string) => void (now = new Date(iso)) };
}

describe("routines", () => {
  it("skips a scheduled turn while the routine's previous run is still going, and says so once", async () => {
    const time = clock("2026-10-02T12:00:30Z");
    t = await testHub({ clock: time.now });
    const bot = await createBot(t, { name: "Ana" });
    const created = (
      await t.api("POST", `/api/v1/bots/${bot.id}/routines`, {
        name: "Every minute",
        trigger: { type: "cron", cron: "* * * * *", timezone: "UTC" },
        instruction: "/sleep 1500\n/reply ok",
      })
    ).body;
    await t.api("POST", `/api/v1/routines/${created.id}/enable`, { force: true });
    time.set("2026-10-02T12:01:00Z");
    expect(t.hub.routines.tick()).toEqual([created.id]);
    time.set("2026-10-02T12:02:00Z");
    expect(t.hub.routines.tick()).toEqual([]);
    time.set("2026-10-02T12:03:00Z");
    expect(t.hub.routines.tick()).toEqual([]);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const items: TimelineItem[] = (await t.api("GET", `/api/v1/conversations/${conv.id}/items?limit=200`)).body;
    expect(items.filter((i) => i.event?.type === "routine.skipped")).toHaveLength(1);
    await t.hub.engine.idle();
    time.set("2026-10-02T12:04:00Z");
    expect(t.hub.routines.tick()).toEqual([created.id]);
    await t.hub.engine.idle();
  });

  it("records how a routine run ended when the hub restarted during it", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana" });
    const created = (
      await t.api("POST", `/api/v1/bots/${bot.id}/routines`, { name: "Report", trigger: { type: "webhook" }, instruction: "/sleep 10000\n/reply ok" })
    ).body;
    const fired = (await t.api("POST", `/api/v1/routines/${created.id}/test`)).body;
    while (t.hub.repos.runs.get(fired.runId)!.status !== "running") await new Promise((r) => setTimeout(r, 5));
    // The process dies: the run stays "running" in the database.
    const dir = t.dataDir;
    t.hub.engine.shutdown = async () => undefined;
    await t.hub.close();
    t = await testHub({}, dir);
    const last = (await t.api("GET", `/api/v1/routines/${created.id}`)).body.lastRun;
    expect(last).toMatchObject({ status: "failed", summary: "the hub stopped during this run" });
  });
});

describe("usage", () => {
  it("counts the tokens of Codex's older event shape once, though its totals are cumulative", () => {
    const state: CodexState = { threadId: null, started: new Set(), lastMessage: null, finished: false, failed: null };
    const tokens = (input: number, output: number) =>
      mapCodexEvent(
        { msg: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output, cached_input_tokens: 0 } } } },
        state,
      )[0];
    expect(tokens(100, 10)).toMatchObject({ inputTokens: 100, outputTokens: 10 });
    expect(tokens(250, 30)).toMatchObject({ inputTokens: 150, outputTokens: 20 });
  });
});
