// specs/cli — acceptance criterion 3 (bots create, then bots list --json).
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis bots", () => {
  it("creates a bot and lists it as JSON (criterion 3)", async () => {
    hub = await startTestHub();
    const created = await runCli(["bots", "create", "--name", "Ana", "--role", "QA", "--brain", "mock"], hub.env);
    expect(created.stderr).toBe("");
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("@ana");

    const listed = await runCli(["bots", "list", "--json"], hub.env);
    expect(listed.code).toBe(0);
    const bots = JSON.parse(listed.stdout);
    expect(bots).toHaveLength(1);
    expect(bots[0]).toMatchObject({ name: "Ana", handle: "ana", role: "QA", brain: { kind: "mock" } });
  });

  it("shows, edits, duplicates and deletes a bot", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const edited = await runCli(["bots", "edit", "@ana", "--role", "QA lead", "--pin", "--json"], hub.env);
    expect(JSON.parse(edited.stdout)).toMatchObject({ role: "QA lead", pinned: true });
    const shown = await runCli(["bots", "show", "@ana"], hub.env);
    expect(shown.stdout).toContain("QA lead");
    const copy = await runCli(["bots", "duplicate", "@ana", "--json"], hub.env);
    expect(JSON.parse(copy.stdout).handle).toBe("ana-copy");

    const refused = await runCli(["bots", "delete", "@ana-copy"], hub.env);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("--yes");
    const deleted = await runCli(["bots", "delete", "@ana-copy", "--yes"], hub.env);
    expect(deleted.code).toBe(0);
    expect(JSON.parse((await runCli(["bots", "list", "--json"], hub.env)).stdout)).toHaveLength(1);
  });

  it("exits 2 on usage errors and 1 on API errors", async () => {
    hub = await startTestHub();
    expect((await runCli(["bots", "create"], hub.env)).code).toBe(2);
    expect((await runCli(["bots", "create", "--name", "X", "--brain", "gpt"], hub.env)).code).toBe(2);
    expect((await runCli(["bots", "frobnicate"], hub.env)).code).toBe(2);
    expect((await runCli(["nope"], hub.env)).code).toBe(2);
    const missing = await runCli(["bots", "show", "@ghost"], hub.env);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("not found");
    const badToken = await runCli(["bots", "list", "--token", "wrong"], hub.env);
    expect(badToken.code).toBe(1);
    expect(badToken.stderr).toContain("missing or invalid token");
  });
});
