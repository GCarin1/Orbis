// specs/cli — `orbis skills` and `orbis routines` against a test hub.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const skillFile = (name: string, description: string, body: string) => {
  dir ??= mkdtempSync(path.join(tmpdir(), "orbis-skill-"));
  const file = path.join(dir, `${name}.md`);
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`);
  return file;
};

describe("orbis skills", () => {
  it("adds, lists, shows, replaces and removes skills, and a bot runs one with /name (criterion 6)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const added = await runCli(["skills", "add", skillFile("greet", "Say hello", "Say hello warmly.")], hub.env);
    expect(added.stderr).toBe("");
    expect(added.stdout).toContain("Added /greet (account).");
    await runCli(["skills", "add", skillFile("triage", "Triage bugs", "Label it."), "@ana"], hub.env);

    expect((await runCli(["skills", "list"], hub.env)).stdout).toContain("/greet account  Say hello");
    const offered = JSON.parse((await runCli(["skills", "list", "@ana", "--offered", "--json"], hub.env)).stdout);
    expect(offered.map((s: { name: string }) => s.name)).toEqual(["greet", "triage"]);
    expect((await runCli(["skills", "show", "greet"], hub.env)).stdout).toContain("Say hello warmly.");

    const replaced = await runCli(["skills", "add", skillFile("greet", "Say hi", "Say hi briefly."), "--replace"], hub.env);
    expect(replaced.stdout).toContain("Updated /greet");
    expect((await runCli(["skills", "show", "greet", "--json"], hub.env)).stdout).toContain("Say hi briefly.");

    // A /skill message runs with the skill (the mock echoes the input).
    const chat = await runCli(["chat", "@ana", "/greet", "the new intern"], hub.env);
    expect(chat.stdout).toContain("@ana: [Ana] the new intern");
    expect(hub.hub.repos.runs.list({ botId: hub.hub.botService.get("ana").id })[0]).toMatchObject({ skill: "greet" });

    expect((await runCli(["skills", "remove", "triage", "@ana"], hub.env)).stdout).toContain("Removed /triage.");
    expect((await runCli(["skills", "add", skillFile("Bad", "x", "y")], hub.env)).code).toBe(1);
    expect((await runCli(["skills", "list", "--offered"], hub.env)).code).toBe(2);
  });
});

describe("orbis routines", () => {
  it("adds, tests, enables, lists and removes routines (criterion 6)", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Ana", "--brain", "mock"], hub.env);
    const created = await runCli(["routines", "add", "@ana", "--name", "Daily", "--cron", "0 9 * * 1-5", "--tz", "America/Sao_Paulo", "--instruction", "/reply all good", "--json"], hub.env);
    expect(created.stderr).toBe("");
    const routine = JSON.parse(created.stdout);
    expect(routine).toMatchObject({ name: "Daily", trigger: { type: "cron", cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" }, enabled: false });

    const refused = await runCli(["routines", "enable", routine.id], hub.env);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/has no successful test run; test it first, or enable with force/);

    const test = await runCli(["routines", "test", routine.id], hub.env);
    expect(test.code).toBe(0);
    expect(test.stdout).toMatch(/Test run run_\w+: done\nall good/);
    expect((await runCli(["routines", "enable", routine.id], hub.env)).stdout).toMatch(/Daily {2}cron "0 9 \* \* 1-5" America\/Sao_Paulo {2}enabled {2}next /);
    expect((await runCli(["routines", "runs", routine.id], hub.env)).stdout).toMatch(/done \(test\) {2}all good/);
    expect((await runCli(["routines", "list", "@ana"], hub.env)).stdout).toContain(routine.id);

    const hook = await runCli(["routines", "add", "@ana", "--name", "On push", "--webhook", "--instruction", "Summarise"], hub.env);
    expect(hook.stdout).toMatch(/POST \/hooks\/routines\/rtn_\w+ signed with X-Orbis-Signature/);
    expect(hook.stdout).toMatch(/secret: [A-Za-z0-9_-]{32}/);

    expect((await runCli(["routines", "disable", routine.id], hub.env)).stdout).toContain("disabled");
    expect((await runCli(["routines", "remove", routine.id], hub.env)).stdout).toContain(`Removed ${routine.id}.`);
    expect((await runCli(["routines", "add", "@ana", "--name", "x", "--instruction", "y"], hub.env)).code).toBe(2);
  });
});
