// specs/cli — acceptance criterion 5 (`orbis group` and `orbis memory`).
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

async function twoBots(env: Record<string, string>): Promise<void> {
  await runCli(["bots", "create", "--name", "Ana", "--role", "QA", "--brain", "mock"], env);
  await runCli(["bots", "create", "--name", "Bob", "--brain", "mock"], env);
}

describe("orbis group", () => {
  it("creates a group, lists it and chats with the mentioned member (criterion 5)", async () => {
    hub = await startTestHub();
    await twoBots(hub.env);
    const created = await runCli(["group", "create", "Release", "@ana", "@bob", "--lead", "@bob"], hub.env);
    expect(created.stderr).toBe("");
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("@ana, @bob (lead)");

    const listed = JSON.parse((await runCli(["group", "list", "--json"], hub.env)).stdout);
    expect(listed).toEqual([expect.objectContaining({ kind: "group", title: "Release" })]);

    const res = await runCli(["group", "chat", "release", "@ana", "check", "the", "logs"], hub.env);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("@ana: [Ana] @ana check the logs");
    expect(res.stdout).not.toContain("@bob:");
    // No mention: the lead answers.
    expect((await runCli(["group", "chat", "Release", "anyone?"], hub.env)).stdout).toContain("@bob: [Bob] anyone?");
  });

  it("follows a handoff until the receiver has answered and the sender has reported back", async () => {
    hub = await startTestHub();
    await twoBots(hub.env);
    const task = JSON.stringify({ to: "@bob", task: "/reply the logs are clean" });
    const res = await runCli(["chat", "@ana", `/tool team.handoff ${task}`], hub.env);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("⇢ @ana → @bob: /reply the logs are clean");
    expect(res.stdout).toContain("@bob: the logs are clean");
    // Ana's report to the user, after Bob's answer (the mock brain echoes its input).
    expect(res.stdout).toMatch(/@ana: \[Ana\] The task you handed off has ended\./);
    expect(res.stdout.indexOf("@bob: the logs are clean")).toBeLessThan(res.stdout.indexOf("@ana: [Ana] The task you handed off"));
  });

  it("adds and removes members and refuses a group of one", async () => {
    hub = await startTestHub();
    await twoBots(hub.env);
    await runCli(["bots", "create", "--name", "Cara", "--brain", "mock"], hub.env);
    await runCli(["group", "create", "Ops", "@ana", "@bob"], hub.env);
    expect((await runCli(["group", "add", "Ops", "@cara"], hub.env)).stdout).toContain("@cara");
    expect((await runCli(["group", "remove", "Ops", "@ana"], hub.env)).stdout).not.toContain("@ana");
    const tooSmall = await runCli(["group", "remove", "Ops", "@bob"], hub.env);
    expect(tooSmall.code).toBe(1);
    expect(tooSmall.stderr).toMatch(/at least 2 bots/);
    expect((await runCli(["group", "create", "Solo", "@ana"], hub.env)).code).toBe(2);
    expect((await runCli(["group", "delete", "Ops"], hub.env)).code).toBe(0);
    expect((await runCli(["group", "chat", "Ops", "hi"], hub.env)).code).toBe(2);
  });
});

describe("orbis memory", () => {
  it("adds, lists, edits and removes bot and team entries (criterion 5)", async () => {
    hub = await startTestHub();
    await twoBots(hub.env);
    const added = await runCli(["memory", "add", "--team", "Staging", "lives", "at", "staging.acme.test", "--json"], hub.env);
    expect(added.code).toBe(0);
    const entry = JSON.parse(added.stdout);
    expect(entry).toMatchObject({ botId: null, kind: "fact", text: "Staging lives at staging.acme.test" });
    expect(JSON.parse((await runCli(["memory", "list", "--team", "--json"], hub.env)).stdout)).toEqual([expect.objectContaining({ id: entry.id })]);

    await runCli(["memory", "add", "@ana", "prefers reports in Portuguese", "--kind", "preference"], hub.env);
    const anaList = await runCli(["memory", "list", "@ana"], hub.env);
    expect(anaList.stdout).toContain("preference");
    expect(anaList.stdout).toContain("prefers reports in Portuguese");
    expect((await runCli(["memory", "list", "@bob"], hub.env)).stdout).toContain("Nothing remembered yet.");

    expect((await runCli(["memory", "edit", entry.id, "Staging moved to qa.acme.test"], hub.env)).code).toBe(0);
    expect((await runCli(["memory", "list", "--team"], hub.env)).stdout).toContain("Staging moved to qa.acme.test");
    expect((await runCli(["memory", "rm", entry.id], hub.env)).code).toBe(0);
    expect(JSON.parse((await runCli(["memory", "list", "--team", "--json"], hub.env)).stdout)).toEqual([]);

    expect((await runCli(["memory", "add", "@ana", "x", "--kind", "gossip"], hub.env)).code).toBe(2);
    expect((await runCli(["memory", "list"], hub.env)).code).toBe(2);
  });
});
