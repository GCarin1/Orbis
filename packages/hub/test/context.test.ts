// specs/memory — acceptance criterion 3 (context assembly and budgets).
import { afterEach, describe, expect, it } from "vitest";
import { assembleContext, CONTEXT_BUDGET, fitHistory, type ContextItem } from "../src/context/assemble.js";
import { newId, nowIso } from "../src/ids.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const item = (n: number, size = 10): ContextItem => ({
  itemId: `i${n}`,
  author: "user",
  role: "user",
  text: String(n).padEnd(size, "."),
  at: new Date(2026, 0, 1, 0, 0, n).toISOString(),
});

describe("context assembly", () => {
  it("keeps at most 30 items, newest first cut, oldest first order", () => {
    const items = Array.from({ length: 50 }, (_, i) => item(i));
    const kept = fitHistory(items);
    expect(kept).toHaveLength(CONTEXT_BUDGET.items);
    expect(kept[0]!.itemId).toBe("i20");
    expect(kept.at(-1)!.itemId).toBe("i49");
  });

  it("keeps at most 12,000 characters, dropping the oldest first", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(i, 2_000));
    const kept = fitHistory(items);
    expect(kept.reduce((n, i) => n + i.text.length, 0)).toBeLessThanOrEqual(CONTEXT_BUDGET.chars);
    expect(kept.map((i) => i.itemId)).toEqual(["i4", "i5", "i6", "i7", "i8", "i9"]);
  });

  it("includes every preference entry and the bot's identity, and leaves out the triggering item (criterion 3)", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana", role: "QA", description: "Never ship on Fridays." });
    const other = await createBot(t, { name: "Bob" });
    const at = nowIso();
    const add = (botId: string | null, kind: "preference" | "fact" | "role", text: string) =>
      t!.hub.repos.memory.insert({ id: newId("mem"), botId, kind, text, source: "test", createdAt: at, updatedAt: at });
    for (let i = 0; i < 12; i++) add(bot.id, "preference", `preference number ${i}`);
    add(null, "role", "The team ships every Tuesday");
    add(bot.id, "fact", "the checkout test is flaky on Chrome");
    add(other.id, "fact", "Bob's private note about checkout");

    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const texts = Array.from({ length: 40 }, (_, i) => `message ${i}`);
    let lastId = "";
    for (const text of texts) {
      lastId = t.hub.timeline.post({ conversationId: conv.id, kind: "message", author: { type: "user", id: null }, text }).id;
    }

    const ctx = assembleContext(
      { bot: t.hub.botService.get(bot.id), conversationId: conv.id, task: "is checkout flaky?", excludeItemId: lastId },
      { items: t.hub.repos.items, memory: t.hub.repos.memory, bots: t.hub.repos.bots },
    );
    expect(ctx.identity).toContain("Ana (@ana), QA");
    expect(ctx.identity).toContain("Never ship on Fridays.");
    const prefs = ctx.memories.filter((m) => m.kind === "preference");
    expect(prefs).toHaveLength(12);
    expect(ctx.memories.some((m) => m.text === "The team ships every Tuesday")).toBe(true);
    expect(ctx.memories.some((m) => m.text.includes("checkout test is flaky"))).toBe(true);
    expect(ctx.memories.some((m) => m.text.includes("Bob's private"))).toBe(false);
    expect(ctx.history).toHaveLength(30);
    expect(ctx.history.some((h) => h.itemId === lastId)).toBe(false);
    expect(ctx.history.at(-1)!.text).toBe("message 38");
  });
});
