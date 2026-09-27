// specs/cli — acceptance criteria 2 (one-shot chat) and 4 (inline approvals).
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis chat", () => {
  it("prints the mock bot's reply and exits 0 (criterion 2)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const res = await runCli(["chat", "@ana", "hi", "there"], hub.env);
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("@ana: [Ana] hi there");
  });

  it("prints the steps of the run as they stream", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const res = await runCli(["chat", "@ana", "/tool team.list_bots {}"], hub.env);
    expect(res.stdout).toContain("· Reading the task");
    expect(res.stdout).toContain("→ team.list_bots {}");
    expect(res.stdout).toContain("←");
  });

  it("exits 1 when the run fails", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const res = await runCli(["chat", "@ana", "/fail broken tool"], hub.env);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("✗ broken tool");
  });

  it("reads the message from stdin when it is not a terminal", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const res = await runCli(["chat", "@ana"], hub.env, "from a pipe\n");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("[Ana] from a pipe");
  });

  it("prints JSON lines with --json", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const res = await runCli(["chat", "@ana", "json please", "--json"], hub.env);
    const item = JSON.parse(res.stdout.trim().split("\n").at(-1)!);
    expect(item).toMatchObject({ kind: "message", text: "[Ana] json please" });
  });

  it("answers a pending approval from the prompt and the run completes (criterion 4)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const bot = hub.hub.botService.get("ana");
    hub.hub.botService.update(bot.id, { policy: { rules: [{ tool: "conversation.post", decision: "ask" }], grants: [] } });

    // An interactive terminal: "a" answers "allow always".
    const res = await runCli(["chat", "@ana", '/tool conversation.post {"text":"progress: 50%"}'], hub.env, "a\n", true);
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("? @ana wants to use conversation.post");
    expect(res.stdout).toContain("allow [o]nce, [a]lways, or [d]eny?");
    expect(res.stdout).toContain("→ allow always");
    expect(res.stdout).toContain("@ana: [Ana] conversation.post → posted");
    expect(hub.hub.botService.get(bot.id).policy.grants).toEqual(["conversation.post"]);
  });

  it("denies with a note from the prompt", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const bot = hub.hub.botService.get("ana");
    hub.hub.botService.update(bot.id, { policy: { rules: [{ tool: "conversation.post", decision: "ask" }], grants: [] } });
    const res = await runCli(["chat", "@ana", '/tool conversation.post {"text":"x"}'], hub.env, "d\ntoo early\n", true);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("error: The user denied conversation.post. Note from the user: too early");
  });

  it("lists and answers approvals with orbis approvals", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const bot = hub.hub.botService.get("ana");
    hub.hub.botService.update(bot.id, { policy: { rules: [{ tool: "conversation.post", decision: "ask" }], grants: [] } });
    const conv = hub.hub.conversationService.directFor(bot.id);
    const { runs } = hub.hub.conversationService.postUserMessage(conv.id, { text: '/tool conversation.post {"text":"y"}' });
    for (let i = 0; i < 100 && hub.hub.approvals.list("pending").length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    const listed = await runCli(["approvals", "list", "--json"], hub.env);
    const [approval] = JSON.parse(listed.stdout);
    expect(approval.tool).toBe("conversation.post");
    const allowed = await runCli(["approvals", "allow", approval.id], hub.env);
    expect(allowed.stdout).toContain("approved (allow once)");
    expect((await hub.hub.engine.wait(runs[0]!.id)).status).toBe("done");
    expect((await runCli(["approvals", "list"], hub.env)).stdout).toContain("Nothing is waiting for you.");
  });
});
