// specs/cli — `orbis secrets` and `orbis usage` against a test hub.
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis secrets", () => {
  it("stores a value piped on stdin, lists names only, and removes it (criterion 7)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const set = await runCli(["secrets", "set", "@ana", "GITHUB_TOKEN"], hub.env, "ghp_value_from_stdin\n");
    expect(set.stderr).toBe("");
    expect(set.stdout).toContain("Stored GITHUB_TOKEN for @ana. Bots use it as {{secret:GITHUB_TOKEN}}");
    expect(hub.hub.secrets.vault.get(hub.hub.botService.get("ana").id, "GITHUB_TOKEN")).toBe("ghp_value_from_stdin");

    const listed = await runCli(["secrets", "list", "@ana"], hub.env);
    expect(listed.stdout).toContain("GITHUB_TOKEN");
    expect(listed.stdout).not.toContain("ghp_value_from_stdin");
    expect(JSON.parse((await runCli(["secrets", "list", "@ana", "--json"], hub.env)).stdout)).toEqual([{ name: "GITHUB_TOKEN", createdAt: expect.any(String) }]);

    expect((await runCli(["secrets", "rm", "@ana", "GITHUB_TOKEN"], hub.env)).stdout).toContain("Removed GITHUB_TOKEN.");
    expect((await runCli(["secrets", "set", "@ana", "bad-name"], hub.env, "x\n")).code).toBe(1);
    expect((await runCli(["secrets", "set", "@ana"], hub.env, "x\n")).code).toBe(2);
  });
});

describe("orbis usage", () => {
  it("prints this month's runs and cost per bot and the total, and JSON with --json (criterion 7)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock", "--spend-cap", "5"], hub.env);
    await runCli(["chat", "@ana", "hello"], hub.env);
    const res = await runCli(["usage"], hub.env);
    expect(res.stdout).toMatch(/^Usage \d{4}-\d{2}-01 → \d{4}-\d{2}-01 \(UTC\)/);
    expect(res.stdout).toMatch(/@ana {2}1 runs {2}\d+ in \/ \d+ out {2}\$0\.00 {2}cap \$5\.00: \$0\.00 used/);
    expect(res.stdout).toMatch(/total {2}1 runs/);
    const report = JSON.parse((await runCli(["usage", "@ana", "--json"], hub.env)).stdout);
    expect(report).toMatchObject({ total: { runs: 1 }, bots: [{ spendCapUsd: 5 }] });
  });
});
