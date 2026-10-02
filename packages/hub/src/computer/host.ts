// The `host` provider: the bot works on the user's own machine (specs/computer).
// Commands run in the folder the user chose (default: their home) with their
// own environment — minus the hub's secrets — so their programs, git and
// logins are there; file tools stay inside that folder; the browser is a
// visible window on the user's screen. Not a boundary at all: the user turns
// it on per bot, knowingly, and writes wait for approval by default.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Bot } from "@orbis/shared";
import { runShell } from "./local.js";
import type { ComputerPaths, ComputerProvider, ComputerView, ExecOptions, ExecResult } from "./provider.js";

/** Variables of the hub that a command on the user's machine never sees. */
const HUB_SECRETS = /^(ORBIS_.*|ANTHROPIC_API_KEY|OPENAI_API_KEY)$/i;

/** The user's environment without the hub's own secrets and tokens. */
export function hostEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && !HUB_SECRETS.test(name)) env[name] = value;
  }
  // Python writes UTF-8 to the pipe instead of the Windows ANSI code page.
  if (process.platform === "win32") env.PYTHONIOENCODING ??= "utf-8";
  return env;
}

/** The folder a host bot works in: its `hostDir`, else the user's home. */
export function hostDir(bot: Bot): string {
  return path.resolve(bot.computer.hostDir?.trim() || homedir());
}

export class HostFolderError extends Error {}

/** The folder must exist and be a directory; the user chose it, so nothing is created. */
export function checkHostDir(dir: string): string {
  if (!path.isAbsolute(dir))
    throw new HostFolderError(`the folder must be a full path, like ${process.platform === "win32" ? "C:\\Users\\you\\Projects" : "/home/you/projects"}`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new HostFolderError(`the folder ${dir} does not exist on this computer`);
  return path.resolve(dir);
}

/** A visible browser needs a screen; a Linux server without one gets a hidden browser. */
export function hasDisplay(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
  if (platform !== "linux") return true;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

export class HostProvider implements ComputerProvider {
  readonly kind = "host";

  async ensure(bot: Bot, paths: ComputerPaths): Promise<void> {
    checkHostDir(hostDir(bot));
    // The bot's own folder still holds its browser profile, screenshots and downloads.
    for (const dir of [paths.workspace, paths.home]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  async exec(bot: Bot, _paths: ComputerPaths, command: string, opts: ExecOptions): Promise<ExecResult> {
    return runShell(command, checkHostDir(hostDir(bot)), hostEnv(), opts);
  }

  async stop(): Promise<void> {
    // Nothing keeps running between commands; the browser is closed by the manager.
  }

  async destroy(): Promise<void> {
    // The user's folder is theirs: nothing of it is removed with the bot.
  }

  async view(): Promise<ComputerView> {
    return { vncPort: null, cdpPort: null };
  }
}
