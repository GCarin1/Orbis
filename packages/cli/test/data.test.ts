// specs/cli — `orbis data export|import` (change 0069-server-runner): a hub's data moves as one `.orbis` file
// from one hub (the phone) to another (a server), its secrets only with the export's password, piped on stdin.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli, startTestHub } from "./helpers.js";

let hubs: Array<Awaited<ReturnType<typeof startTestHub>>> = [];
const dir = mkdtempSync(path.join(tmpdir(), "orbis-data-"));
afterEach(async () => {
  for (const h of hubs) await h.cleanup();
  hubs = [];
});

describe("orbis data", () => {
  it("exports a hub to a file and imports it into another, the secrets only with the password", async () => {
    const phone = await startTestHub();
    const server = await startTestHub();
    hubs.push(phone, server);
    expect((await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], phone.env)).code).toBe(0);
    const ana = (phone.hub.db.prepare("SELECT id FROM bots").get() as { id: string }).id;
    phone.hub.secrets.vault.set(ana, "GITHUB_TOKEN", "ghp_moves_sealed");

    const file = path.join(dir, "phone.orbis");
    expect((await runCli(["data", "export", "-o", file, "--password"], phone.env, "short\n")).stderr).toContain("at least 10 characters");
    const exported = await runCli(["data", "export", "-o", file, "--password"], phone.env, "a long export password\n");
    expect(exported.stderr).toBe("");
    expect(exported.stdout).toContain("secrets sealed by your password");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o077).toBe(0);

    const wrong = await runCli(["data", "import", file, "--password"], server.env, "not the password\n");
    expect(wrong.code).toBe(1);
    const imported = await runCli(["data", "import", file, "--password"], server.env, "a long export password\n");
    expect(imported.stderr).toBe("");
    expect(imported.stdout).toMatch(/bots\s+1 added, 0 already here/);
    expect(imported.stdout).toMatch(/secrets\s+1 added/);
    expect(server.hub.secrets.vault.get(ana, "GITHUB_TOKEN")).toBe("ghp_moves_sealed");
    // Again: nothing doubles.
    const again = JSON.parse((await runCli(["data", "import", file, "--json"], server.env)).stdout);
    expect(again.tables.bots).toEqual({ added: 0, skipped: 1 });
    expect(again.secrets.opened).toBe(false);
  });

  it("names its usage", async () => {
    const h = await startTestHub();
    hubs.push(h);
    expect((await runCli(["data", "import"], h.env)).stderr).toContain("orbis data import <file.orbis>");
    expect((await runCli(["data"], h.env)).stderr).toContain("orbis data export");
    rmSync(dir, { recursive: true, force: true });
  });
});
