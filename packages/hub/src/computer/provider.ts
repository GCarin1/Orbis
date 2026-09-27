// The provider interface behind every bot's computer (ADR 0005, specs/computer).
import type { Bot, ComputerProviderKind } from "@orbis/shared";

/** contracts/hub-surface § Budgets: shell-output and shell-timeout. */
export const SHELL_OUTPUT_CAP = 64 * 1024;
export const SHELL_TIMEOUT_SEC = 120;

export interface ExecOptions {
  timeoutMs: number;
  /** Bytes of combined stdout and stderr kept; the rest is counted and dropped. */
  outputCap: number;
  signal?: AbortSignal;
}

export interface ExecResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  /** Bytes dropped past the output cap. */
  droppedBytes: number;
}

/** Where a computer's screen can be reached on the hub host. */
export interface ComputerView {
  /** noVNC (websockify + web client) port, when the provider has a desktop. */
  vncPort: number | null;
  /** Chrome DevTools Protocol port of the computer's own browser, when it has one. */
  cdpPort: number | null;
}

/** Host paths of a bot's computer. The workspace is always a host directory. */
export interface ComputerPaths {
  workspace: string;
  home: string;
  browserProfile: string;
}

export interface ComputerProvider {
  readonly kind: ComputerProviderKind | (string & {});
  /** Start (creating if needed) the bot's computer. Idempotent. */
  ensure(bot: Bot, paths: ComputerPaths): Promise<void>;
  /** Run a shell command with the workspace as working directory. */
  exec(bot: Bot, paths: ComputerPaths, command: string, opts: ExecOptions): Promise<ExecResult>;
  /** Stop the computer and keep its disk (hibernation). */
  stop(botId: string): Promise<void>;
  /** Remove everything the provider holds for the bot (container, volume). */
  destroy(botId: string): Promise<void>;
  view(botId: string): Promise<ComputerView>;
}
