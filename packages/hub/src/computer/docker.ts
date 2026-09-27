// The `docker` provider: one container from `orbis/desktop` and one named
// volume per bot (ADR 0005, specs/computer). The workspace stays a host
// directory, bind-mounted into the container, so file tools and CLI brains
// see the same files; the home directory (browser profile, desktop
// settings) lives in the volume. Every docker call goes through a
// CommandRunner so tests can record them without a daemon.
import { spawn } from "node:child_process";
import type { Bot } from "@orbis/shared";
import type { ComputerPaths, ComputerProvider, ComputerView, ExecOptions, ExecResult } from "./provider.js";

export const DEFAULT_DESKTOP_IMAGE = "orbis/desktop:latest";
export const DEFAULT_CPUS = 1;
export const DEFAULT_MEMORY_MB = 2048;
/** Ports inside the image: noVNC (websockify + web client) and the Chromium DevTools relay. */
export const VNC_PORT = 6080;
export const CDP_PORT = 9223;
const CONTAINER_HOME = "/home/orbis";
const CONTAINER_WORKSPACE = `${CONTAINER_HOME}/workspace`;

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  droppedBytes?: number;
}

export type CommandRunner = (args: string[], opts?: { timeoutMs?: number; signal?: AbortSignal; outputCap?: number }) => Promise<CommandResult>;

/** Run the docker CLI (`docker` on PATH, or ORBIS_DOCKER). */
export function dockerCli(executable = process.env.ORBIS_DOCKER || "docker"): CommandRunner {
  return (args, opts = {}) =>
    new Promise((resolve) => {
      const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      const cap = opts.outputCap ?? 1024 * 1024;
      let stdout = "";
      let stderr = "";
      let dropped = 0;
      let timedOut = false;
      child.stdout.on("data", (d: Buffer) => {
        const room = cap - stdout.length;
        if (room > 0) stdout += d.subarray(0, room).toString("utf8");
        dropped += Math.max(0, d.length - Math.max(room, 0));
      });
      child.stderr.on("data", (d: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += d.toString("utf8");
      });
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, opts.timeoutMs)
        : null;
      const onAbort = () => child.kill("SIGKILL");
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      const done = (code: number | null, extra = "") => {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        resolve({ code, stdout, stderr: stderr + extra, timedOut, droppedBytes: dropped });
      };
      child.on("error", (err) => done(null, err.message));
      child.on("close", (code) => done(code));
    });
}

export class DockerError extends Error {}

export class DockerProvider implements ComputerProvider {
  readonly kind = "docker";

  constructor(private readonly run: CommandRunner = dockerCli()) {}

  static container(botId: string): string {
    return `orbis-${botId}`;
  }

  static volume(botId: string): string {
    return `orbis-home-${botId}`;
  }

  private async must(args: string[], what: string): Promise<CommandResult> {
    const res = await this.run(args);
    if (res.code !== 0) {
      const detail = (res.stderr || res.stdout).trim().split("\n").slice(-3).join(" ");
      throw new DockerError(`docker ${what} failed${detail ? `: ${detail}` : ""}${res.code === null ? " (is Docker installed and running?)" : ""}`);
    }
    return res;
  }

  /** "running", "stopped" or "missing". */
  private async state(botId: string): Promise<"running" | "stopped" | "missing"> {
    const res = await this.run(["inspect", "--format", "{{.State.Running}}", DockerProvider.container(botId)]);
    if (res.code !== 0) return "missing";
    return res.stdout.trim() === "true" ? "running" : "stopped";
  }

  async ensure(bot: Bot, paths: ComputerPaths): Promise<void> {
    const name = DockerProvider.container(bot.id);
    const state = await this.state(bot.id);
    if (state === "running") return;
    if (state === "missing") {
      const volume = DockerProvider.volume(bot.id);
      await this.must(["volume", "create", "--label", `orbis.bot=${bot.id}`, volume], "volume create");
      const cfg = bot.computer;
      await this.must(
        [
          "create",
          "--name",
          name,
          "--label",
          `orbis.bot=${bot.id}`,
          "--hostname",
          bot.handle,
          "--cpus",
          String(cfg.cpus ?? DEFAULT_CPUS),
          "--memory",
          `${cfg.memoryMb ?? DEFAULT_MEMORY_MB}m`,
          "--shm-size",
          "512m",
          "--mount",
          `type=volume,source=${volume},target=${CONTAINER_HOME}`,
          "--mount",
          `type=bind,source=${paths.workspace},target=${CONTAINER_WORKSPACE}`,
          "--publish",
          `127.0.0.1::${VNC_PORT}`,
          "--publish",
          `127.0.0.1::${CDP_PORT}`,
          cfg.image ?? DEFAULT_DESKTOP_IMAGE,
        ],
        "create",
      );
    }
    await this.must(["start", name], "start");
  }

  async exec(bot: Bot, _paths: ComputerPaths, command: string, opts: ExecOptions): Promise<ExecResult> {
    const seconds = Math.max(1, Math.ceil(opts.timeoutMs / 1000));
    // `timeout` inside the container kills the command itself, not only the docker client.
    const res = await this.run(
      ["exec", "--workdir", CONTAINER_WORKSPACE, DockerProvider.container(bot.id), "timeout", "--signal=KILL", String(seconds), "sh", "-c", command],
      { timeoutMs: opts.timeoutMs + 10_000, signal: opts.signal, outputCap: opts.outputCap },
    );
    const timedOut = Boolean(res.timedOut) || res.code === 137 || res.code === 124;
    const output = (res.stdout + res.stderr).slice(0, opts.outputCap);
    return { exitCode: timedOut ? null : res.code, output, timedOut, droppedBytes: res.droppedBytes ?? 0 };
  }

  async stop(botId: string): Promise<void> {
    if ((await this.state(botId)) === "running") await this.must(["stop", "--time", "10", DockerProvider.container(botId)], "stop");
  }

  async destroy(botId: string): Promise<void> {
    await this.run(["rm", "--force", "--volumes", DockerProvider.container(botId)]);
    await this.run(["volume", "rm", "--force", DockerProvider.volume(botId)]);
  }

  private async port(botId: string, port: number): Promise<number | null> {
    const res = await this.run(["port", DockerProvider.container(botId), `${port}/tcp`]);
    if (res.code !== 0) return null;
    const m = /:(\d+)\s*$/m.exec(res.stdout.trim().split("\n")[0] ?? "");
    return m ? Number(m[1]) : null;
  }

  async view(botId: string): Promise<ComputerView> {
    if ((await this.state(botId)) !== "running") return { vncPort: null, cdpPort: null };
    return { vncPort: await this.port(botId, VNC_PORT), cdpPort: await this.port(botId, CDP_PORT) };
  }
}
