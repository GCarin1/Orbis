// specs/agent-runtimes — Windows `.cmd` shims run without cmd.exe (change
// 0021-bot-behaviour-audit): npm's cmd-shim pointing at a Node script or at a
// native program (Claude Code 2 installs `bin/claude.exe`), and npm's own
// npx.cmd / npm.cmd (Node 24), which set the script in a variable next to
// npm-prefix.js — the file Orbis used to pick by mistake.
import { describe, expect, it } from "vitest";
import { launchCommand, unwrapCmdShim } from "../../src/brains/process.js";
import { stderrSummary } from "../../src/mcp/client.js";

const NPM_DIR = "C:\\Users\\Admin\\AppData\\Roaming\\npm";
const NODE = "C:\\Program Files\\nodejs\\node.exe";

const CMD_SHIM_JS = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*
`;

const CMD_SHIM_EXE = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*
`;

const NPX_CMD = `:: Created by npm, please don't edit manually.
@ECHO OFF

SETLOCAL

SET "NODE_EXE=%~dp0\\node.exe"
IF NOT EXIST "%NODE_EXE%" (
  SET "NODE_EXE=node"
)

SET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"
SET "NPX_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npx-cli.js"
FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (
  SET "NPM_PREFIX_NPX_CLI_JS=%%F\\node_modules\\npm\\bin\\npx-cli.js"
)
IF EXIST "%NPM_PREFIX_NPX_CLI_JS%" (
  SET "NPX_CLI_JS=%NPM_PREFIX_NPX_CLI_JS%"
)

"%NODE_EXE%" "%NPX_CLI_JS%" %*
`;

describe("Windows shims", () => {
  it("runs the Node script of an npm package with node", () => {
    expect(unwrapCmdShim(`${NPM_DIR}\\codex.cmd`, CMD_SHIM_JS, () => false, NODE)).toEqual({
      command: NODE,
      args: [`${NPM_DIR}\\node_modules\\@openai\\codex\\bin\\codex.js`],
    });
  });

  it("runs Claude Code 2's native claude.exe directly, never node.exe", () => {
    expect(unwrapCmdShim(`${NPM_DIR}\\claude.CMD`, CMD_SHIM_EXE, () => false, NODE)).toEqual({
      command: `${NPM_DIR}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
      args: [],
    });
    expect(
      launchCommand(
        `${NPM_DIR}\\claude.CMD`,
        ["-p", "line one\nline two"],
        "win32",
        () => CMD_SHIM_EXE,
        () => false,
      ),
    ).toEqual({
      command: `${NPM_DIR}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
      args: ["-p", "line one\nline two"],
    });
  });

  it("runs npx-cli.js for npx.cmd, not npm-prefix.js (the MCP servers started with npx)", () => {
    const dir = "C:\\Program Files\\nodejs";
    expect(
      launchCommand(
        `${dir}\\npx.cmd`,
        ["-y", "@playwright/mcp@latest"],
        "win32",
        () => NPX_CMD,
        (f) => f === NODE,
      ),
    ).toEqual({
      command: NODE,
      args: [`${dir}\\node_modules\\npm\\bin\\npx-cli.js`, "-y", "@playwright/mcp@latest"],
    });
    const npm = NPX_CMD.replaceAll("NPX_CLI_JS", "NPM_CLI_JS").replaceAll("npx-cli.js", "npm-cli.js");
    expect(
      launchCommand(
        `${dir}\\npm.cmd`,
        ["install", "-g", "@openai/codex@latest"],
        "win32",
        () => npm,
        (f) => f === NODE,
      ).args[0],
    ).toBe(`${dir}\\node_modules\\npm\\bin\\npm-cli.js`);
  });

  it("refuses a batch file that names no program, and leaves other platforms alone", () => {
    expect(() =>
      launchCommand(
        "C:\\tools\\run.bat",
        [],
        "win32",
        () => "@echo off\r\necho hi",
        () => false,
      ),
    ).toThrow(/Windows batch file/);
    expect(launchCommand("/usr/bin/claude", ["-p"], "linux")).toEqual({ command: "/usr/bin/claude", args: ["-p"] });
  });

  it("says why an MCP server stopped with its error line, not Node's closing banner", () => {
    // What Node 24 printed when npx.cmd ran npm-prefix.js instead of npx-cli.js.
    const crash = [
      "node:internal/modules/cjs/loader:1386",
      "  throw err;",
      "  ^",
      "",
      "Error: Cannot find module 'C:\\Users\\Admin\\AppData\\Roaming\\npm\\node_modules\\@playwright\\mcp\\cli.js'",
      "    at Module._resolveFilename (node:internal/modules/cjs/loader:1383:15)",
      "  code: 'MODULE_NOT_FOUND',",
      "}",
      "",
      "Node.js v24.13.1",
    ].join("\r\n");
    expect(stderrSummary(crash)).toMatch(/^Error: Cannot find module/);
    expect(stderrSummary("starting\nlistening on stdio\n}\nNode.js v24.13.1\n")).toBe("starting listening on stdio");
  });
});
