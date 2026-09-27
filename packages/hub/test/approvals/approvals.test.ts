// specs/approvals — acceptance criteria 2 and 3.
import { afterEach, describe, expect, it } from "vitest";
import type { Approval, Run } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function waitFor<T>(fn: () => T | undefined, ms = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const ASK_POST = { rules: [{ tool: "conversation.post", decision: "ask" as const }], grants: [] };

async function startAskingRun(t: TestHub, text = '/tool conversation.post {"text":"status update"}') {
  const bot = await createBot(t, { policy: ASK_POST });
  const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
  const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text });
  const runId = posted.body.runs[0].id as string;
  const approval = await waitFor(() => t.hub.repos.approvals.list("pending").find((a) => a.runId === runId));
  return { bot, conv, runId, approval };
}

describe("approvals", () => {
  it("pauses the run on ask, posts a card, broadcasts approval.requested; allow once executes and resumes (criterion 2)", async () => {
    t = await testHub();
    const { bot, conv, runId, approval } = await startAskingRun(t);

    expect(t.hub.repos.runs.get(runId)!.status).toBe("waiting");
    expect(t.hub.botService.get(bot.id).state).toBe("waiting");
    expect(t.events.some((e) => e.type === "approval.requested" && (e.data as { approval: Approval }).approval.id === approval.id)).toBe(true);
    const card = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body.find((i: { kind: string }) => i.kind === "card");
    expect(card.card).toMatchObject({ type: "approval", state: "pending", data: { approvalId: approval.id, tool: "conversation.post", input: { text: "status update" } } });
    // The call has not executed yet.
    expect((await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body.some((i: { text: string }) => i.text === "status update")).toBe(false);

    const pending = await t.api("GET", "/api/v1/approvals?status=pending");
    expect(pending.body.map((a: Approval) => a.id)).toContain(approval.id);

    const answered = await t.api("POST", `/api/v1/approvals/${approval.id}`, { decision: "allow_once" });
    expect(answered.body).toMatchObject({ status: "approved", decision: "allow_once" });
    const run = (await t.hub.engine.wait(runId)) as Run;
    expect(run.status).toBe("done");
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.some((i: { text: string }) => i.text === "status update")).toBe(true);
    expect(items.find((i: { kind: string }) => i.kind === "card").card.state).toBe("approved");
    expect((await t.api("POST", `/api/v1/approvals/${approval.id}`, { decision: "deny" })).status).toBe(409);
  });

  it("deny returns a denial with the user's note to the brain and executes nothing (criterion 2)", async () => {
    t = await testHub();
    const { conv, runId, approval } = await startAskingRun(t);
    await t.api("POST", `/api/v1/approvals/${approval.id}`, { decision: "deny", note: "not now" });
    const run = await t.hub.engine.wait(runId);
    const result = run.steps.find((s) => s.type === "tool_result")!;
    expect(result).toMatchObject({ isError: true, output: "The user denied conversation.post. Note from the user: not now" });
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.some((i: { text: string }) => i.text === "status update")).toBe(false);
    expect(items.find((i: { kind: string }) => i.kind === "card").card.state).toBe("denied");
  });

  it("allow always stores a grant so the next identical call runs without a card (criterion 3)", async () => {
    t = await testHub();
    const { bot, conv, runId, approval } = await startAskingRun(t);
    await t.api("POST", `/api/v1/approvals/${approval.id}`, { decision: "allow_always" });
    await t.hub.engine.wait(runId);
    expect(t.hub.botService.get(bot.id).policy.grants).toEqual(["conversation.post"]);

    const again = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool conversation.post {"text":"second update"}' });
    const run2 = await t.hub.engine.wait(again.body.runs[0].id);
    expect(run2.status).toBe("done");
    expect(t.hub.repos.approvals.list().filter((a) => a.botId === bot.id)).toHaveLength(1);

    // A locked ask still asks, whatever the grant.
    await t.api("PATCH", `/api/v1/bots/${bot.id}`, {
      policy: { rules: [{ tool: "conversation.*", decision: "ask", locked: true }], grants: ["conversation.post"] },
    });
    const third = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool conversation.post {"text":"third"}' });
    const locked = await waitFor(() => t!.hub.repos.approvals.list("pending").find((a) => a.runId === third.body.runs[0].id));
    expect(locked.tool).toBe("conversation.post");
    await t.api("POST", `/api/v1/approvals/${locked.id}`, { decision: "allow_once" });
    await t.hub.engine.wait(third.body.runs[0].id);
  });

  it("expires the approval when the run ends while it is pending", async () => {
    t = await testHub();
    const { conv, runId, approval } = await startAskingRun(t);
    await t.api("POST", `/api/v1/runs/${runId}/cancel`);
    const run = await t.hub.engine.wait(runId);
    expect(run.status).toBe("cancelled");
    expect(t.hub.repos.approvals.get(approval.id)!.status).toBe("expired");
    const card = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body.find((i: { kind: string }) => i.kind === "card");
    expect(card.card.state).toBe("expired");
  });

  it("asks before computer.shell by default and denies a locked deny without asking", async () => {
    t = await testHub();
    const bot = await createBot(t, { policy: { rules: [{ tool: "http.*", decision: "deny", locked: true }], grants: [] } });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool http.fetch {"url":"http://127.0.0.1:1/"}' });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.steps.find((s) => s.type === "tool_result")!.output).toMatch(/denied by this bot's policy \(rule http\.\*: deny, locked\)/);
    expect(t.hub.repos.approvals.list()).toHaveLength(0);
  });
});
