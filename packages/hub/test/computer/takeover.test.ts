// specs/computer — acceptance criterion 7 (takeover pauses the bot's tool calls).
import { afterEach, describe, expect, it } from "vitest";
import type { Run } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function until(check: () => boolean, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function start(t: TestHub, botId: string, text: string): Promise<string> {
  const conv = (await t.api("GET", `/api/v1/bots/${botId}/conversation`)).body;
  return (await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text })).body.runs[0].id;
}

describe("takeover", () => {
  it("holds the bot's tool calls while the user has the computer and resumes on hand-back (criterion 7)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const taken = await t.api("POST", `/api/v1/bots/${bot.id}/computer/takeover`);
    expect(taken.body).toMatchObject({ takeover: true, status: "running" });

    const runId = await start(t, bot.id, '/tool computer.write_file {"path":"after.txt","content":"done"}');
    const run = () => t!.hub.repos.runs.get(runId)!;
    await until(() => run().status === "waiting");
    expect(t.hub.botService.get(bot.id).state).toBe("waiting");
    await new Promise((r) => setTimeout(r, 150));
    expect(run().steps.some((s) => s.type === "tool_result")).toBe(false); // still held

    const released = await t.api("POST", `/api/v1/bots/${bot.id}/computer/release`);
    expect(released.body.takeover).toBe(false);
    const finished: Run = await t.hub.engine.wait(runId);
    expect(finished.status).toBe("done");
    expect(finished.steps.find((s) => s.type === "tool_result")).toMatchObject({ isError: false, output: "wrote 4 bytes to after.txt" });
    const updates = t.events.filter((e) => e.type === "computer.updated").map((e) => (e.data as { computer: { takeover: boolean } }).computer.takeover);
    expect(updates).toContain(true);
    expect(updates.at(-1)).toBe(false);
  });

  it("only holds the bot that is taken over, and a cancelled run stops waiting", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await t.api("POST", `/api/v1/bots/${ana.id}/computer/takeover`);

    const bobRun = await t.hub.engine.wait(await start(t, bob.id, "/tool computer.list_files {}"));
    expect(bobRun.status).toBe("done");

    const anaRun = await start(t, ana.id, "/tool computer.list_files {}");
    await until(() => t!.hub.repos.runs.get(anaRun)!.status === "waiting");
    await t.api("POST", `/api/v1/runs/${anaRun}/cancel`);
    expect((await t.hub.engine.wait(anaRun)).status).toBe("cancelled");
  });
});
