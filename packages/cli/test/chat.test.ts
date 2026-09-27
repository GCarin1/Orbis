// specs/cli — acceptance criterion 2 (one-shot chat); criterion 4 (inline approvals) lands in change 0002.
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
});
