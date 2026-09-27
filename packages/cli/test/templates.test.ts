// specs/cli — `orbis bots export` and `orbis bots import`.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
let dir: string | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("orbis bots export and import", () => {
  it("writes a template and imports it as a new bot (criterion 8)", async () => {
    hub = await startTestHub();
    dir = mkdtempSync(path.join(tmpdir(), "orbis-template-"));
    await runCli(["bots", "create", "--name", "Ana", "--role", "QA", "--brain", "mock", "--description", "Checks releases."], hub.env);
    const file = path.join(dir, "ana.orbis.yaml");
    const exported = await runCli(["bots", "export", "@ana", "--out", file], hub.env);
    expect(exported.stdout).toContain(`Wrote ${file} (no memory, history or secrets inside).`);
    expect(readFileSync(file, "utf8")).toContain("kind: BotTemplate");
    expect((await runCli(["bots", "export", "@ana"], hub.env)).stdout).toMatch(/^# Orbis bot template/);

    const imported = await runCli(["bots", "import", file], hub.env);
    expect(imported.stderr).toBe("");
    expect(imported.stdout).toContain("Imported Ana as @ana-2.");
    const fromStdin = JSON.parse((await runCli(["bots", "import", "-", "--json"], hub.env, readFileSync(file, "utf8"))).stdout);
    expect(fromStdin).toMatchObject({ name: "Ana", handle: "ana-3", role: "QA", description: "Checks releases." });

    await runCli(["bots", "edit", "@ana", "--description", "token: ghp_0123456789abcdefghijklmnopqrstuvwxyzAB"], hub.env);
    const refused = await runCli(["bots", "export", "@ana"], hub.env);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/line \d+: GitHub token/);
  });
});
