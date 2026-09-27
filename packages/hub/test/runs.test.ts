// specs/bots criterion 6, specs/conversations criterion 5, specs/agent-runtimes criterion 7.
import { afterEach, describe, expect, it } from "vitest";
import type { StreamEvent } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const states = (events: StreamEvent[], botId: string) =>
  events.filter((e) => e.type === "bot.state" && (e.data as { botId: string }).botId === botId).map((e) => (e.data as { state: string }).state);

describe("runs", () => {
  it("moves the bot through thinking, working and done with one bot.state event per transition (bots criterion 6)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, {
      text: '/tool team.list_bots {}\ncheck the team',
    });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("done");
    const seq = states(t.events, bot.id);
    expect(seq).toEqual(["thinking", "working", "thinking", "done"]);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect((await t.api("GET", `/api/v1/bots/${bot.id}`)).body.state).toBe("done");

    // Reading the conversation brings a done bot back to idle.
    await t.api("POST", `/api/v1/conversations/${conv.id}/read`);
    expect((await t.api("GET", `/api/v1/bots/${bot.id}`)).body.state).toBe("idle");
  });

  it("queues messages sent during a run and runs them in arrival order (conversations criterion 5)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const first = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "/sleep 300\n/reply first" });
    const second = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "/reply second" });
    const third = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "/reply third" });
    expect(t.hub.repos.runs.get(second.body.runs[0].id)!.status).toBe("queued");

    const runs = await Promise.all([first, second, third].map((p) => t!.hub.engine.wait(p.body.runs[0].id)));
    expect(runs.map((r) => r.status)).toEqual(["done", "done", "done"]);
    // Each run started only after the previous one finished.
    expect(runs[1]!.startedAt! >= runs[0]!.finishedAt!).toBe(true);
    expect(runs[2]!.startedAt! >= runs[1]!.finishedAt!).toBe(true);
    const replies = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body
      .filter((i: { author: { type: string } }) => i.author.type === "bot")
      .map((i: { text: string }) => i.text);
    expect(replies).toEqual(["first", "second", "third"]);
  });

  it("fails the run and blocks the bot when the brain fails or outlives its timeout (agent-runtimes criterion 7)", async () => {
    t = await testHub();
    const failing = await createBot(t, { name: "Failing" });
    const conv = (await t.api("GET", `/api/v1/bots/${failing.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "/fail disk on fire" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("failed");
    expect(run.error).toBe("disk on fire");
    expect((await t.api("GET", `/api/v1/bots/${failing.id}`)).body.state).toBe("blocked");
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.at(-1)).toMatchObject({ kind: "event", event: { type: "run.failed" } });

    const slow = await createBot(t, { name: "Slow", brain: { kind: "mock", timeoutSec: 1 } });
    const slowConv = (await t.api("GET", `/api/v1/bots/${slow.id}/conversation`)).body;
    const slowPost = await t.api("POST", `/api/v1/conversations/${slowConv.id}/messages`, { text: "/sleep 5000" });
    const slowRun = await t.hub.engine.wait(slowPost.body.runs[0].id);
    expect(slowRun.status).toBe("failed");
    expect(slowRun.error).toMatch(/timed out after 1s/);
    expect((await t.api("GET", `/api/v1/bots/${slow.id}`)).body.state).toBe("blocked");
  });

  it("cancels a queued run and a running run", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const running = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "/sleep 5000" });
    const queued = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "later" });
    expect((await t.api("POST", `/api/v1/runs/${queued.body.runs[0].id}/cancel`)).body.cancelled).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect((await t.api("POST", `/api/v1/runs/${running.body.runs[0].id}/cancel`)).body.cancelled).toBe(true);
    const [a, b] = await Promise.all([
      t.hub.engine.wait(running.body.runs[0].id),
      t.hub.engine.wait(queued.body.runs[0].id),
    ]);
    expect(a.status).toBe("cancelled");
    expect(b.status).toBe("cancelled");
  });

  it("fails at once a run whose brain is not configured", async () => {
    t = await testHub();
    const bot = await createBot(t, { brain: { kind: "custom-cli" } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "hi" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/no command configured/);
  });
});
