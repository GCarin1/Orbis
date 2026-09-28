// specs/computer — the three kinds of computer (change 0017-computer-modes):
// `host` works in a folder of the user's own machine with their environment
// minus the hub's secrets, file tools stay in that folder, writes ask first,
// the folder must exist, templates never carry host access; the bot is told
// where it works; `GET /computers` says what Docker needs and builds the image.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { Run } from "@orbis/shared";
import { hostEnv } from "../../src/computer/host.js";
import { ComputerSetup } from "../../src/computer/setup.js";
import type { CommandRunner } from "../../src/computer/docker.js";
import { defaultDecisionOf } from "../../src/tools/registry.js";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
const dirs: string[] = [];
afterEach(async () => {
  await t?.cleanup();
  t = null;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const allow = { rules: [{ tool: "computer.*", decision: "allow" }], grants: [] };
const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result");
const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;

describe("the host computer (the user's own machine)", () => {
  it("runs commands in the chosen folder with the user's environment minus the hub's secrets, and keeps file tools in that folder", async () => {
    const folder = realpathSync(mkdtempSync(path.join(tmpdir(), "orbis-host-")));
    dirs.push(folder);
    writeFileSync(path.join(folder, "notes.txt"), "the user's own file");
    const saved = { key: process.env.OPENAI_API_KEY, mine: process.env.MY_PROJECT_SETTING };
    process.env.OPENAI_API_KEY = "sk-hub-must-not-leak";
    process.env.MY_PROJECT_SETTING = "users-own-variable";
    try {
      t = await testHub();
      const bot = await createBot(t, { policy: allow, computer: { enabled: true, provider: "host", hostDir: folder } });
      expect(bot.computer).toEqual({ enabled: true, provider: "host", hostDir: folder });
      const { runs } = await chat(
        t,
        bot.id,
        [
          tool("computer.shell", { command: "pwd; echo HOME=$HOME; env" }),
          tool("computer.read_file", { path: "notes.txt" }),
          tool("computer.write_file", { path: "report.md", content: "# done" }),
          tool("computer.read_file", { path: "../outside.txt" }),
        ].join("\n"),
      );
      const [shell, read, write, outside] = results(runs[0]);
      expect(shell!.output).toContain(`\n${folder}\n`);
      expect(shell!.output).toContain(`HOME=${homedir()}`);
      expect(shell!.output).toContain("MY_PROJECT_SETTING=users-own-variable");
      expect(shell!.output).not.toMatch(/sk-hub-must-not-leak|ORBIS_/);
      expect(read!.output).toBe("the user's own file");
      expect(write!.isError).toBe(false);
      expect(readFileSync(path.join(folder, "report.md"), "utf8")).toBe("# done");
      expect(outside).toMatchObject({ isError: true, output: expect.stringContaining("outside your workspace") });
      expect(t.hub.computer.status(bot).provider).toBe("host");

      // The bot is told it works on the user's real machine, in that folder.
      expect(t.hub.computer.contextSection(bot)).toMatch(new RegExp(`user's own machine .*You work in ${folder.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")}`));
      // Deleting the bot leaves the user's folder alone.
      expect((await t.api("DELETE", `/api/v1/bots/${bot.id}`)).status).toBe(204);
      expect(readFileSync(path.join(folder, "notes.txt"), "utf8")).toBe("the user's own file");
    } finally {
      for (const [name, value] of [
        ["OPENAI_API_KEY", saved.key],
        ["MY_PROJECT_SETTING", saved.mine],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("asks before writing on the user's machine, refuses a folder that does not exist, and keeps host access out of templates", async () => {
    t = await testHub();
    const host = await createBot(t, { name: "Hana", computer: { enabled: true, provider: "host" } });
    const local = await createBot(t, { name: "Lia" });
    const write = t.hub.tools.get("computer.write_file");
    expect(defaultDecisionOf(write, host)).toBe("ask");
    expect(defaultDecisionOf(write, local)).toBe("allow");
    expect(defaultDecisionOf(t.hub.tools.get("computer.shell"), local)).toBe("ask");
    // No folder named: the user's home.
    expect(t.hub.computer.workDir(host)).toBe(path.resolve(homedir()));

    const missing = await t.api("PATCH", `/api/v1/bots/${local.id}`, {
      computer: { enabled: true, provider: "host", hostDir: path.join(tmpdir(), "no-such-folder-orbis") },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields["computer.hostDir"]).toMatch(/does not exist/);
    expect(
      (await t.api("PATCH", `/api/v1/bots/${local.id}`, { computer: { enabled: true, provider: "host", hostDir: "relative/dir" } })).body.error.fields[
        "computer.hostDir"
      ],
    ).toMatch(/full path/);

    const exported = await t.hub.app.inject({ method: "GET", url: `/api/v1/bots/${host.id}/export`, headers: { authorization: "Bearer test-token" } });
    expect(exported.body).not.toContain("host");
    const yaml = exported.body.replace("computer:\n    enabled: true", "computer:\n    enabled: true\n    provider: host\n    hostDir: /");
    const imported = await t.api("POST", "/api/v1/bots/import", { yaml });
    expect(imported.status).toBe(201);
    expect(imported.body.computer.provider).toBeUndefined();
  });

  it("gives every command the user's variables except the hub's", () => {
    expect(hostEnv({ PATH: "/bin", ORBIS_TOKEN: "t", ORBIS_MASTER_KEY: "k", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", GITHUB_TOKEN: "mine" })).toEqual({
      PATH: "/bin",
      GITHUB_TOKEN: "mine",
    });
  });
});

describe("what each computer needs", () => {
  it("reports Docker and the desktop image, and builds the image with one call", async () => {
    const calls: string[][] = [];
    let built = false;
    const docker: CommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "version") return { code: 0, stdout: "27.3.1\n", stderr: "" };
      if (args[0] === "image") return built ? { code: 0, stdout: "sha256:abc", stderr: "" } : { code: 1, stdout: "", stderr: "No such image" };
      if (args[0] === "build") {
        built = true;
        return { code: 0, stdout: "", stderr: "#1 building\n#9 naming to docker.io/orbis/desktop:latest done\n" };
      }
      return { code: 1, stdout: "", stderr: "unexpected" };
    };
    const setup = new ComputerSetup("local", docker, "/repo/docker/desktop/");
    t = await testHub({ computerSetup: setup });
    const info = (await t.api("GET", "/api/v1/computers")).body;
    expect(info).toMatchObject({
      default: "local",
      local: { available: true },
      host: { available: true, home: homedir() },
      docker: {
        available: true,
        installed: true,
        version: "27.3.1",
        imagePresent: false,
        canBuild: true,
        image: "orbis/desktop:latest",
        build: { state: "idle" },
      },
    });
    const started = await t.api("POST", "/api/v1/computers/docker/image");
    expect(started.status).toBe(202);
    expect(started.body.state).toBe("building");
    await expect.poll(async () => (await t!.api("GET", "/api/v1/computers")).body.docker.build.state).toBe("done");
    const after = (await t.api("GET", "/api/v1/computers")).body.docker;
    expect(after.imagePresent).toBe(true);
    expect(after.build.log).toContain("naming to docker.io/orbis/desktop:latest");
    expect(calls).toContainEqual(["build", "--tag", "orbis/desktop:latest", "/repo/docker/desktop/"]);
  });

  it("says when Docker is missing or stopped, and refuses to build then", async () => {
    const stopped = new ComputerSetup("local", async (args) =>
      args[0] === "version"
        ? { code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" }
        : { code: 1, stdout: "", stderr: "" },
    );
    t = await testHub({ computerSetup: stopped });
    const info = (await t.api("GET", "/api/v1/computers")).body.docker;
    expect(info).toMatchObject({ available: false, installed: true, imagePresent: false });
    expect(info.error).toMatch(/Is the docker daemon running/);
    const refused = await t.api("POST", "/api/v1/computers/docker/image");
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("docker_unavailable");

    const missing = new ComputerSetup("local", async () => ({ code: null, stdout: "", stderr: "spawn docker ENOENT" }));
    expect((await missing.info()).docker).toMatchObject({ available: false, installed: false, error: "Docker is not installed (or not on PATH)" });
  });
});
