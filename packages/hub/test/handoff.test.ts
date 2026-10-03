// specs/handoff — acceptance criteria 1 to 4.
import { afterEach, describe, expect, it } from "vitest";
import type { Run, TimelineItem } from "@orbis/shared";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const handoff = (args: Record<string, unknown>) => `/tool team.handoff ${JSON.stringify(args)}`;
const items = async (t: TestHub, conversationId: string): Promise<TimelineItem[]> =>
  (await t.api("GET", `/api/v1/conversations/${conversationId}/items?limit=200`)).body;
const runsOf = (t: TestHub, botId: string): Run[] => t.hub.repos.runs.list({ botId }).reverse();

describe("handoff", () => {
  it("acknowledges at once, runs the receiver after, shows a card and threads the reply under it (criterion 1)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob", role: "Engineering" });
    const { conversation, runs } = await chat(t, ana.id, handoff({ to: "@bob", task: "/sleep 200\n/reply logs are clean", context: "deploy 42" }));
    const anaRun = runs[0] as Run;
    const ack = anaRun.steps.find((s) => s.type === "tool_result")!;
    expect(ack.isError).toBe(false);
    expect(ack.output).toMatch(/^Handed off to @bob \(handoff itm_\w+\)/);
    expect(anaRun.status).toBe("done");

    await t.hub.engine.idle();
    const bobRun = runsOf(t, bob.id)[0]!;
    expect(bobRun).toMatchObject({ status: "done", depth: 1, trigger: { type: "handoff" }, reply: "logs are clean" });
    // The sender did not wait: its run ended before the receiver's.
    expect(anaRun.finishedAt! <= bobRun.finishedAt!).toBe(true);
    expect(bobRun.createdAt >= anaRun.startedAt!).toBe(true);
    expect(bobRun.input).toContain("@ana (Ana, QA) handed you this task:");
    expect(bobRun.input).toContain("Context from @ana:\ndeploy 42");

    const timeline = await items(t, conversation.id);
    const card = timeline.find((i) => i.card?.type === "handoff")!;
    expect(card).toMatchObject({ kind: "card", text: "@ana → @bob: /sleep 200\n/reply logs are clean" });
    expect(card.card).toMatchObject({ state: "done", data: { from: ana.id, to: bob.id, receiverRunId: bobRun.id } });
    const reply = timeline.find((i) => i.runId === bobRun.id && i.kind === "message")!;
    expect(reply).toMatchObject({ parentId: card.id, author: { type: "bot", id: bob.id }, text: "logs are clean" });
    const states = t.events
      .filter((e) => e.type === "timeline.item" && (e.data as { item: TimelineItem }).item.id === card.id)
      .map((e) => (e.data as { item: TimelineItem }).item.card!.state);
    expect(states).toEqual(expect.arrayContaining(["queued", "running", "done"]));
  });

  it("gives the receiver no history of the sender's conversation", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await chat(t, ana.id, "/reply the secret plan is X");
    await chat(t, ana.id, handoff({ to: "@bob", task: "summarise" }));
    await t.hub.engine.idle();
    const bobRun = runsOf(t, bob.id)[0]!;
    expect(bobRun.steps[0]!.text).toBe("Reading the task (0 earlier items in context)");
  });

  it("wakes the sender with the receiver's answer, and not with returnResult false (criterion 2)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    await createBot(t, { name: "Bob" });
    await chat(t, ana.id, handoff({ to: "@bob", task: "/reply 3 flaky tests" }));
    await t.hub.engine.idle();
    const anaRuns = runsOf(t, ana.id);
    expect(anaRuns).toHaveLength(2);
    expect(anaRuns[1]).toMatchObject({ status: "done", trigger: { type: "report", ref: anaRuns[0]!.id }, depth: 2 });
    expect(anaRuns[1]!.input).toBe(
      'The task you handed off has ended.\nTell the user the outcome in one message: what was done, what failed and what needs them. Do not hand the same tasks off again.\n\n@bob (Bob, QA) — "/reply 3 flaky tests" — done. Answer:\n3 flaky tests',
    );

    await chat(t, ana.id, handoff({ to: "@bob", task: "fire and forget", returnResult: false }));
    await t.hub.engine.idle();
    expect(runsOf(t, ana.id)).toHaveLength(3);
  });

  it("stops two bots handing work back and forth at the depth limit and posts an event (criterion 3)", async () => {
    t = await testHub({ config: { maxHandoffDepth: 4 } });
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    // A chain of handoffs six levels deep, alternating @bob and @ana.
    let task = "/reply the end";
    for (let level = 6; level >= 1; level--) task = handoff({ to: level % 2 ? "@bob" : "@ana", task, returnResult: false });
    const { conversation } = await chat(t, ana.id, task);
    await t.hub.engine.idle();
    const all = [...runsOf(t, ana.id), ...runsOf(t, bob.id)];
    expect(all.map((r) => r.depth).sort()).toEqual([0, 1, 2, 3, 4]);
    const last = all.find((r) => r.depth === 4)!;
    expect(last.steps.find((s) => s.type === "tool_result")).toMatchObject({ isError: true, output: expect.stringMatching(/reached its limit \(4\)/) });
    const events = (await items(t, conversation.id)).filter((i) => i.event?.type === "handoff.depth_exceeded");
    expect(events).toHaveLength(1);
    expect(events[0]!.event!.data).toMatchObject({ depth: 5, limit: 4 });
  });

  it("does not let two bots mentioned in one message wake each other back and forth", async () => {
    t = await testHub({ config: { maxHandoffDepth: 4 } });
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Ping", members: [ana.id, bob.id] })).body;
    // Both answer the user; each echoed reply mentions the other, who already answered this message.
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@ana say hi to @bob" });
    await t.hub.engine.idle();
    const all = [...runsOf(t, ana.id), ...runsOf(t, bob.id)];
    expect(all.map((r) => r.trigger.type)).toEqual(["message", "message"]);
    expect(new Set(all.map((r) => r.chainId)).size).toBe(1);
  });

  it("refuses a handoff to the sending bot itself (criterion 4)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const { runs } = await chat(t, ana.id, handoff({ to: "@ana", task: "loop" }));
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result")).toMatchObject({ isError: true, output: "you cannot hand a task to yourself" });
    const unknown = await chat(t, ana.id, handoff({ to: "@nobody", task: "x" }));
    expect(unknown.runs[0].steps.find((s: { type: string }) => s.type === "tool_result").output).toMatch(/no bot or squad with the handle/);
  });

  it("fails the card when the receiver is deleted before its run starts", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const conv = t.hub.conversationService.directFor(ana.id);
    // Keep Bob busy in this conversation so the handoff run waits in the queue.
    const busy = t.hub.engine.enqueue({ botId: bob.id, conversationId: conv.id, trigger: { type: "api", ref: null }, input: "/sleep 3000" });
    const { conversation } = await chat(t, ana.id, handoff({ to: "@bob", task: "later" }));
    expect(t.hub.repos.runs.get(busy.id)!.status).toBe("running");
    await t.api("DELETE", `/api/v1/bots/${bob.id}`);
    const card = (await items(t, conversation.id)).find((i) => i.card?.type === "handoff")!;
    expect(card.card!.state).toBe("failed");
  });
});
