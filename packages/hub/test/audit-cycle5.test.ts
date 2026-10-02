// Audit cycle 5 (change 0027-audit-cycle-5-performance-and-sweep): a sweep of
// the earlier cycles' changes, and what slowed the hub down.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { STEPS_WRITE_MS } from "../src/runs/engine.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("the hub under load", () => {
  it("writes a long run's steps a few times, not once per step, and keeps every step", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const conv = t.hub.conversationService.directFor(ana.id);
    let writes = 0;
    const setSteps = t.hub.repos.runs.setSteps.bind(t.hub.repos.runs);
    t.hub.repos.runs.setSteps = (id, steps) => {
      writes++;
      setSteps(id, steps);
    };
    const calls = Array.from({ length: 40 }, (_, i) => `/tool memory.search ${JSON.stringify({ query: `lápis ${i}` })}`);
    const run = t.hub.engine.enqueue({
      botId: ana.id,
      conversationId: conv.id,
      trigger: { type: "api", ref: null },
      input: [...calls, "/reply ok"].join("\n"),
    });
    const ended = await t.hub.engine.wait(run.id);
    const stored = t.hub.repos.runs.get(run.id)!.steps;
    expect(stored).toHaveLength(ended.steps.length);
    expect(stored.filter((s) => s.type === "tool_result")).toHaveLength(40);
    expect(writes).toBeLessThan(stored.length / 4);
    expect(STEPS_WRITE_MS).toBeLessThanOrEqual(250);
  });

  it("indexes the lookups every run makes", async () => {
    t = await testHub();
    const file = ["orbis.db", "hub.db", "orbis.sqlite"].map((f) => path.join(t!.dataDir, f)).find((f) => existsSync(f))!;
    const db = new DatabaseSync(file, { readOnly: true });
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((r) => r.name);
    db.close();
    expect(names).toEqual(expect.arrayContaining(["items_by_run", "runs_by_conversation", "runs_by_status", "approvals_by_run", "routine_runs_by_run"]));
  });
});

describe("trying a run again", () => {
  it("keeps the run in its chain, so its reply does not wake again a bot that chain already ran", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "G", members: [ana.id, bob.id], leadBotId: ana.id })).body;
    // Bob answers first, then Ana's run fails (no key).
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { brain: { kind: "openai", model: "gpt-5" } });
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@everyone /reply pergunte ao @bob" });
    await t.hub.engine.idle();
    const failed = t.hub.repos.runs.list({ botId: ana.id })[0]!;
    expect(failed.status).toBe("failed");
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { brain: { kind: "mock" } });
    const retried = (await t.api("POST", `/api/v1/runs/${failed.id}/retry`)).body;
    expect(retried.chainId).toBe(failed.chainId);
    await t.hub.engine.idle();
    // Ana's retried reply names @bob, who already answered this message: Bob is not woken again.
    expect(t.hub.repos.runs.list({ botId: bob.id }).map((r) => r.trigger.type)).toEqual(["message"]);
  });
});
