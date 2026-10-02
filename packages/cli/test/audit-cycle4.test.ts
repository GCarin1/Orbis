// Audit cycle 4 (change 0026-audit-cycle-4-mcp-and-apis): `orbis chat` follows
// the work its own message set off, not another message's.
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis chat", () => {
  it("does not wait for, nor print, a run another message started in the same conversation", async () => {
    hub = await startTestHub();
    const ana = hub.hub.botService.create({ name: "Ana", brain: { kind: "mock" } });
    const conv = hub.hub.conversationService.directFor(ana.id);
    const chatting = runCli(["chat", "@ana", "/sleep 600\n/reply mine"], hub.env);
    await new Promise((r) => setTimeout(r, 200));
    // Someone else's work lands in the same conversation meanwhile (a colleague's mention, in its own chain).
    const other = hub.hub.engine.enqueue({
      botId: ana.id,
      conversationId: conv.id,
      trigger: { type: "mention", ref: null },
      input: "/sleep 1500\n/reply theirs",
    });
    const res = await chatting;
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("mine");
    expect(res.stdout).not.toContain("theirs");
    expect(hub.hub.repos.runs.get(other.id)!.status).not.toBe("done");
    await hub.hub.engine.wait(other.id);
  });
});
