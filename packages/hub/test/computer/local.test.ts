// specs/computer — acceptance criteria 1, 2, 3 and 6 (the local provider).
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Run } from "@orbis/shared";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
const outside: string[] = [];
afterEach(async () => {
  await t?.cleanup();
  t = null;
  for (const dir of outside.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const allowShell = { rules: [{ tool: "computer.shell", decision: "allow" }], grants: [] };
const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result");
const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;

describe("computer (local provider)", () => {
  it("runs computer.shell in the bot's workspace with a scrubbed environment and kills it past the timeout (criterion 1)", async () => {
    const saved = { token: process.env.ORBIS_TOKEN, key: process.env.ORBIS_MASTER_KEY };
    process.env.ORBIS_TOKEN = "hub-token-must-not-leak";
    process.env.ORBIS_MASTER_KEY = "master-key-must-not-leak";
    try {
      t = await testHub();
      const bot = await createBot(t, { policy: allowShell });
      const workspace = realpathSync(t.hub.computer.ensureWorkspace(bot.id));
      const { runs } = await chat(t, bot.id, tool("computer.shell", { command: "pwd; env" }));
      const out = results(runs[0])[0]!;
      expect(out.isError).toBe(false);
      expect(out.output).toMatch(/^exit code: 0\n/);
      expect(out.output).toContain(`\n${workspace}\n`);
      expect(out.output).not.toMatch(/ORBIS_|must-not-leak/);
      expect(out.output).toContain(`HOME=${t.hub.computer.paths(bot.id).home}`);

      // Past the timeout the whole process group dies: the background child never writes.
      const started = Date.now();
      const slow = await chat(t, bot.id, tool("computer.shell", { command: "(sleep 2; touch late.txt) & sleep 30", timeoutSec: 1 }));
      const killed = results(slow.runs[0])[0]!;
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(killed).toMatchObject({ isError: true, output: expect.stringMatching(/^timed out after 1s; the command was killed/) });
      await new Promise((r) => setTimeout(r, 2_500));
      expect(existsSync(path.join(workspace, "late.txt"))).toBe(false);
    } finally {
      process.env.ORBIS_TOKEN = saved.token;
      process.env.ORBIS_MASTER_KEY = saved.key;
      if (saved.token === undefined) delete process.env.ORBIS_TOKEN;
      if (saved.key === undefined) delete process.env.ORBIS_MASTER_KEY;
    }
  });

  it("cuts output at 64 KiB and reports a failing exit code", async () => {
    t = await testHub();
    const bot = await createBot(t, { policy: allowShell });
    const { runs } = await chat(t, bot.id, `${tool("computer.shell", { command: "yes x | head -c 100000; echo; echo THE-END" })}\n${tool("computer.shell", { command: "exit 3" })}`);
    const [big, failed] = results(runs[0]);
    // 100,009 bytes → 65,536 kept: the model sees the start and the end of what was kept, and why.
    expect(big!.output).toMatch(/^exit code: 0 \(output cut at 64 KiB: 34473 more bytes dropped; long output: redirect it to a file/);
    expect(big!.output).toContain("characters omitted");
    expect(big!.output.length).toBeLessThan(20_000);
    expect(failed).toMatchObject({ isError: true, output: "exit code: 3" });
  });

  it("asks before a shell command by default", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: tool("computer.shell", { command: "echo hi" }) });
    for (let i = 0; i < 100 && (await t.api("GET", "/api/v1/approvals?status=pending")).body.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    const [approval] = (await t.api("GET", "/api/v1/approvals?status=pending")).body;
    expect(approval).toMatchObject({ tool: "computer.shell", input: { command: "echo hi" } });
    await t.api("POST", `/api/v1/approvals/${approval.id}`, { decision: "deny", note: "not now" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(results(run)[0]).toMatchObject({ isError: true });
  });

  it("confines file tools to the workspace: no ../, no outside absolute paths, no symlinks out (criterion 2)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const workspace = t.hub.computer.ensureWorkspace(bot.id);
    const secretDir = mkdtempSync(path.join(tmpdir(), "orbis-outside-"));
    outside.push(secretDir);
    writeFileSync(path.join(secretDir, "secret.txt"), "top secret");
    symlinkSync(path.join(secretDir, "secret.txt"), path.join(workspace, "link.txt"));
    symlinkSync(secretDir, path.join(workspace, "linkdir"));
    mkdirSync(path.join(workspace, "notes"));
    writeFileSync(path.join(workspace, "notes", "a.md"), "inside");

    const attempts = [
      tool("computer.read_file", { path: "../../../../../../etc/passwd" }),
      tool("computer.read_file", { path: path.join(secretDir, "secret.txt") }),
      tool("computer.read_file", { path: "link.txt" }),
      tool("computer.read_file", { path: "linkdir/secret.txt" }),
      tool("computer.write_file", { path: "linkdir/planted.txt", content: "x" }),
      tool("computer.write_file", { path: "../escape.txt", content: "x" }),
      tool("computer.list_files", { path: "linkdir" }),
    ];
    const { runs } = await chat(t, bot.id, attempts.join("\n"));
    for (const result of results(runs[0])) {
      expect(result).toMatchObject({ isError: true, output: expect.stringMatching(/is outside your workspace/) });
    }
    expect(existsSync(path.join(secretDir, "planted.txt"))).toBe(false);
    expect(existsSync(path.join(path.dirname(workspace), "escape.txt"))).toBe(false);

    // Inside the workspace everything works, absolute or relative.
    const ok = await chat(
      t,
      bot.id,
      [
        tool("computer.read_file", { path: path.join(workspace, "notes", "a.md") }),
        tool("computer.write_file", { path: "out/report.md", content: "# Report" }),
        tool("computer.list_files", { recursive: true }),
      ].join("\n"),
    );
    const [read, wrote, listed] = results(ok.runs[0]);
    expect(read).toMatchObject({ isError: false, output: "inside" });
    expect(wrote!.output).toBe("wrote 8 bytes to out/report.md");
    expect(listed!.output).toContain("notes/a.md  6 B");
    expect(listed!.output).toContain("out/report.md  8 B");
  });

  it("never lets one bot read another bot's workspace (criterion 3)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await chat(t, ana.id, tool("computer.write_file", { path: "private.txt", content: "Ana's notes" }));
    const anaFile = path.join(t.hub.computer.workspaceDir(ana.id), "private.txt");
    expect(existsSync(anaFile)).toBe(true);
    const { runs } = await chat(
      t,
      bob.id,
      [tool("computer.read_file", { path: anaFile }), tool("computer.read_file", { path: `../../${ana.id}/workspace/private.txt` })].join("\n"),
    );
    for (const result of results(runs[0])) {
      expect(result).toMatchObject({ isError: true, output: expect.stringMatching(/is outside your workspace/) });
      expect(result.output).not.toContain("Ana's notes");
    }
  });

  it("hibernates a computer idle for longer than hibernateAfter, and wakes it on the next tool (criterion 6)", async () => {
    t = await testHub();
    const bot = await createBot(t, { computer: { enabled: true, hibernateAfterMin: 1 } });
    await chat(t, bot.id, tool("computer.list_files", {}));
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/computer`)).body).toMatchObject({ provider: "local", status: "running", takeover: false });

    expect(await t.hub.computer.sweep(Date.now() + 30_000)).toEqual([]); // not idle long enough
    expect(await t.hub.computer.sweep(Date.now() + 61_000)).toEqual([bot.id]);
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/computer`)).body.status).toBe("hibernated");
    expect(t.events.filter((e) => e.type === "computer.updated").map((e) => (e.data as { computer: { status: string } }).computer.status)).toEqual([
      "running",
      "hibernated",
    ]);

    await chat(t, bot.id, tool("computer.list_files", {}));
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/computer`)).body.status).toBe("running");
  });

  it("refuses the tools of a bot whose computer is disabled, and starts and stops on request", async () => {
    t = await testHub();
    const off = await createBot(t, { name: "Off", computer: { enabled: false } });
    const { runs } = await chat(t, off.id, tool("computer.list_files", {}));
    expect(results(runs[0])[0]!.output).toMatch(/has no computer: it is disabled/);
    expect((await t.api("POST", `/api/v1/bots/${off.id}/computer/start`)).status).toBe(409);

    const on = await createBot(t, { name: "On" });
    expect((await t.api("POST", `/api/v1/bots/${on.id}/computer/start`)).body.status).toBe("running");
    expect((await t.api("POST", `/api/v1/bots/${on.id}/computer/stop`)).body.status).toBe("stopped");
    expect((await t.api("GET", `/api/v1/bots/${on.id}/computer/screenshot`)).status).toBe(404);
  });
});
