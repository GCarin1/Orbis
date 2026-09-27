// specs/usage — acceptance criteria 1 to 3.
import { afterEach, describe, expect, it } from "vitest";
import type { Run } from "@orbis/shared";
import type { BrainAdapter } from "../src/brains/types.js";
import { costOf, PRICES } from "../src/brains/pricing.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

/**
 * A brain whose task says what it costs: "cost=0.6 sub=1 in=100 out=20",
 * then a step after the usage event (to prove a capped run stops there).
 */
const metered: BrainAdapter = {
  kind: "mock",
  check: () => null,
  async *run(input) {
    const n = (key: string) => Number(new RegExp(`${key}=([\\d.]+)`).exec(input.task)?.[1] ?? 0);
    yield { type: "run.started" };
    yield { type: "run.usage", inputTokens: n("in"), outputTokens: n("out"), cachedTokens: n("cached"), costUsd: n("cost"), subscription: n("sub") === 1 };
    yield { type: "step.thinking", text: "after the usage event" };
    yield { type: "run.finished", reply: "done" };
  },
};

describe("usage", () => {
  it("sums usage per bot and for the account, for the month and for a date range (criterion 1)", async () => {
    t = await testHub({ brains: [metered] });
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await chat(t, ana.id, "cost=0.25 in=1000 out=200 cached=300");
    await chat(t, ana.id, "cost=0.5 sub=1 in=2000 out=400");
    const bobRun = (await chat(t, bob.id, "cost=0.125 in=500 out=100")).runs[0] as Run;

    const month = (await t.api("GET", "/api/v1/usage")).body;
    const now = new Date();
    expect(month.from).toBe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString());
    expect(month.total).toEqual({ runs: 3, inputTokens: 3500, outputTokens: 700, cachedTokens: 300, costUsd: 0.875, subscriptionCostUsd: 0.5 });
    const byBot = Object.fromEntries(month.bots.map((b: { botId: string }) => [b.botId, b]));
    expect(byBot[ana.id]).toMatchObject({ usage: { runs: 2, costUsd: 0.75, subscriptionCostUsd: 0.5 }, cappedCostUsd: 0.25, spendCapUsd: null });
    expect(byBot[bob.id]).toMatchObject({ usage: { runs: 1, costUsd: 0.125, subscriptionCostUsd: 0 }, cappedCostUsd: 0.125 });
    expect((await t.api("GET", `/api/v1/usage?botId=${bob.id}`)).body.bots).toHaveLength(1);

    // A run from last month counts in its own range, not in this month's.
    t.hub.db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run("2026-01-15T10:00:00.000Z", bobRun.id);
    expect((await t.api("GET", "/api/v1/usage")).body.total.runs).toBe(2);
    const january = (await t.api("GET", "/api/v1/usage?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z")).body;
    expect(january.total).toMatchObject({ runs: 1, costUsd: 0.125 });
    expect((await t.api("GET", "/api/v1/usage?from=2026-02-01&to=2026-01-01")).status).toBe(400);
  });

  it("refuses a bot's run at its cap and stops a run that crosses it after the current step (criterion 2)", async () => {
    t = await testHub({ brains: [metered] });
    const bot = await createBot(t, { spendCapUsd: 1 });
    const first = (await chat(t, bot.id, "cost=0.6")).runs[0] as Run;
    expect(first.status).toBe("done");

    const crossing = (await chat(t, bot.id, "cost=0.6")).runs[0] as Run;
    expect(crossing).toMatchObject({ status: "failed", error: "stopped: this run took the month to $1.20, over the spend cap of $1.00" });
    expect(crossing.steps.some((s) => s.text === "after the usage event")).toBe(false);

    const { runs, conversation } = await chat(t, bot.id, "cost=0.1");
    expect(runs[0]).toMatchObject({ status: "failed", error: "spend cap reached: $1.20 of $1.00 this month (UTC); raise the cap or wait for next month", usage: { costUsd: 0 } });
    expect(t.hub.botService.get(bot.id).state).toBe("blocked");
    const items = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body;
    expect(items.at(-1)).toMatchObject({ kind: "event", event: { type: "run.failed" }, text: expect.stringContaining("spend cap reached: $1.20 of $1.00") });

    // Raising the cap lets the bot work again.
    await t.api("PATCH", `/api/v1/bots/${bot.id}`, { spendCapUsd: 5 });
    expect(((await chat(t, bot.id, "cost=0.1")).runs[0] as Run).status).toBe("done");
  });

  it("flags subscription cost and leaves it out of the cap unless the bot says otherwise (criterion 3)", async () => {
    t = await testHub({ brains: [metered] });
    const cli = await createBot(t, { name: "Cli", spendCapUsd: 1 });
    await chat(t, cli.id, "cost=3 sub=1");
    const next = (await chat(t, cli.id, "cost=2 sub=1")).runs[0] as Run;
    expect(next).toMatchObject({ status: "done", usage: { costUsd: 2, subscription: true } });

    const strict = await createBot(t, { name: "Strict", spendCapUsd: 1, capIncludesSubscription: true });
    const over = (await chat(t, strict.id, "cost=3 sub=1")).runs[0] as Run;
    expect(over.status).toBe("failed");
    expect(over.error).toMatch(/over the spend cap of \$1\.00/);
    const report = (await t.api("GET", "/api/v1/usage")).body;
    const byBot = Object.fromEntries(report.bots.map((b: { botId: string }) => [b.botId, b]));
    expect(byBot[cli.id]).toMatchObject({ usage: { costUsd: 5, subscriptionCostUsd: 5 }, cappedCostUsd: 0, capIncludesSubscription: false });
    expect(byBot[strict.id]).toMatchObject({ usage: { costUsd: 3, subscriptionCostUsd: 3 }, cappedCostUsd: 3, capIncludesSubscription: true });
  });

  it("prices API usage from the shipped table, overridable with prices.json", async () => {
    expect(costOf("claude-sonnet-5", { input: 1_000_000, output: 100_000 })).toBe(2 + 1);
    expect(costOf("llama3.2", { input: 1_000_000, output: 1_000_000 })).toBe(0);
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-prices-"));
    writeFileSync(path.join(dir, "prices.json"), JSON.stringify({ "llama3.2": { input: 0.1, output: 0.2 } }));
    t = await testHub({}, dir);
    expect(t.hub.config.prices["llama3.2"]).toEqual({ input: 0.1, output: 0.2 });
    expect(t.hub.config.prices["claude-sonnet-5"]).toEqual(PRICES["claude-sonnet-5"]);
    expect(costOf("llama3.2", { input: 1_000_000, output: 1_000_000 }, t.hub.config.prices)).toBeCloseTo(0.3, 6);
    await t.cleanup();
    t = null;
    rmSync(dir, { recursive: true, force: true });
  });
});
