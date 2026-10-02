// Audit cycle 3 (change 0025-audit-cycle-3-computer-tools): the bot's
// computer — the shell on Windows, file tools on what is not plain text, and
// long web pages.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatSnapshot, type PageSnapshot } from "../src/computer/browser.js";
import { shellCommand, shellEnv } from "../src/computer/local.js";
import { READ_MAX_BYTES } from "../src/computer/tools.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;
const result = (run: { steps: Array<{ type: string; output?: string; isError?: boolean }> }) => run.steps.find((s) => s.type === "tool_result")!;

describe("the shell on Windows", () => {
  const paths = { workspace: "C:\\orbis\\bots\\ana\\workspace", home: "C:\\orbis\\bots\\ana\\home" };
  const windows = {
    Path: "C:\\Windows\\system32;C:\\Program Files\\nodejs",
    SystemRoot: "C:\\Windows",
    ComSpec: "C:\\Windows\\system32\\cmd.exe",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    ProgramFiles: "C:\\Program Files",
    APPDATA: "C:\\Users\\Admin\\AppData\\Roaming",
    ORBIS_TOKEN: "never",
  };

  it("gives commands the system's variables and a profile of the bot's own, so npm, git and python start", () => {
    const env = shellEnv(paths, windows, "win32");
    expect(env).toMatchObject({
      PATH: windows.Path,
      SystemRoot: "C:\\Windows",
      ProgramFiles: "C:\\Program Files",
      USERPROFILE: paths.home,
      PYTHONIOENCODING: "utf-8",
    });
    expect(env.APPDATA).toContain(paths.home);
    expect(env.TEMP).toContain(paths.home);
    expect(env.ORBIS_TOKEN).toBeUndefined();
    expect(shellEnv(paths, { PATH: "/usr/bin" }, "linux")).toEqual({ PATH: "/usr/bin", HOME: paths.home, LANG: "C.UTF-8", TERM: "dumb" });
  });

  it("switches cmd.exe to UTF-8 before the command, so accents arrive intact", () => {
    expect(shellCommand("echo não", { ComSpec: windows.ComSpec }, "win32")).toEqual({
      file: windows.ComSpec,
      args: ["/d", "/s", "/c", "chcp 65001 >nul & echo não"],
    });
    expect(shellCommand("echo não", {}, "linux")).toEqual({ file: "/bin/sh", args: ["-c", "echo não"] });
  });
});

describe("file tools", () => {
  it("says plainly when a file or folder is missing, binary or too large", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana" });
    const workspace = t.hub.computer.ensureWorkspace(bot.id);
    writeFileSync(path.join(workspace, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a]));
    writeFileSync(path.join(workspace, "big.log"), Buffer.alloc(READ_MAX_BYTES + 1, 0x61));
    mkdirSync(path.join(workspace, "docs"));
    const read = async (input: object) => result((await chat(t!, bot.id, tool("computer.read_file", input))).runs[0]);
    const list = async (input: object) => result((await chat(t!, bot.id, tool("computer.list_files", input))).runs[0]);
    expect(await read({ path: "nota.txt" })).toMatchObject({
      isError: true,
      output: 'there is no file "nota.txt" in your workspace; computer.list_files shows what is there',
    });
    expect((await read({ path: "logo.png" })).output).toBe("logo.png is a binary file (7 bytes), not text; computer.shell can inspect or convert it");
    expect((await read({ path: "big.log" })).output).toMatch(/^big\.log has \d+ bytes, too large to read whole/);
    expect((await list({ path: "relatorios" })).output).toBe('there is no folder "relatorios" in your workspace; computer.list_files shows what is there');
    expect((await list({ path: "logo.png" })).output).toBe("logo.png is a file; read it with computer.read_file");
    expect((await list({ path: "docs" })).output).toBe("docs is empty");
  });
});

describe("long web pages", () => {
  it("reads a long page's text in parts", () => {
    const page: PageSnapshot = {
      title: "Artigo",
      url: "https://example.com",
      text: `${"a".repeat(12_000)}FIM`,
      links: [],
      fields: [],
      buttons: [],
      password: false,
      captcha: false,
      otp: false,
    };
    const first = formatSnapshot(page);
    expect(first).toContain("[… 3 more characters of page text: browser.snapshot with offset 12000 reads on]");
    expect(first).not.toContain("FIM");
    const second = formatSnapshot(page, 12_000);
    expect(second).toContain("[page text from character 12000 of 12003]");
    expect(second).toContain("FIM");
    expect(second).not.toContain("more characters");
  });
});
