// What each kind of computer needs on this machine, and the one-click build of
// the desktop image (specs/computer): `local` and `host` need nothing; `docker`
// needs Docker running and the `orbis/desktop` image, which the hub builds from
// the Dockerfile shipped in `docker/desktop/`.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ComputerProviderKind, ComputerProvidersInfo, ImageBuild } from "@orbis/shared";
import { hasDisplay } from "./host.js";
import { DEFAULT_DESKTOP_IMAGE, dockerCli, type CommandRunner } from "./docker.js";

/** A build of the desktop image takes minutes (a Debian base, Chromium, noVNC). */
const BUILD_TIMEOUT_MS = 30 * 60_000;
const LOG_LINES = 30;

/** `docker/desktop/` of the repository, from `packages/hub/{src,dist}/computer/`. */
export function defaultDesktopDir(): string | null {
  const dir = fileURLToPath(new URL("../../../../docker/desktop/", import.meta.url));
  return existsSync(`${dir}Dockerfile`) ? dir : null;
}

const tail = (text: string, lines = LOG_LINES) => text.trim().split(/\r?\n/).slice(-lines).join("\n");

export class ComputerSetup {
  private build: ImageBuild = { state: "idle", startedAt: null, finishedAt: null, log: "", error: null };

  constructor(
    private readonly defaultProvider: ComputerProviderKind,
    private readonly run: CommandRunner = dockerCli(),
    private readonly desktopDir: string | null = defaultDesktopDir(),
    private readonly image = DEFAULT_DESKTOP_IMAGE,
  ) {}

  async info(): Promise<ComputerProvidersInfo> {
    const version = await this.run(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 });
    const installed = version.code !== null;
    const available = version.code === 0 && version.stdout.trim() !== "";
    let error: string | null = null;
    if (!installed) error = "Docker is not installed (or not on PATH)";
    else if (!available) error = tail(version.stderr || version.stdout, 2) || "Docker is installed but its engine is not running";
    const imagePresent = available ? (await this.run(["image", "inspect", "--format", "{{.Id}}", this.image], { timeoutMs: 15_000 })).code === 0 : false;
    return {
      default: this.defaultProvider,
      local: { available: true },
      host: { available: true, home: homedir(), platform: process.platform, visibleBrowser: hasDisplay() },
      docker: {
        available,
        installed,
        version: available ? version.stdout.trim() : null,
        error,
        image: this.image,
        imagePresent,
        canBuild: this.desktopDir !== null,
        build: { ...this.build },
      },
    };
  }

  buildState(): ImageBuild {
    return { ...this.build };
  }

  /** Start building the desktop image; resolves once the build ends (callers need not wait). */
  startBuild(): { started: boolean; build: ImageBuild; done: Promise<void> } {
    if (this.build.state === "building") return { started: false, build: this.buildState(), done: Promise.resolve() };
    if (!this.desktopDir) throw new Error("the desktop image's Dockerfile is not part of this install; build docker/desktop from the Orbis repository");
    this.build = { state: "building", startedAt: new Date().toISOString(), finishedAt: null, log: "", error: null };
    const done = this.run(["build", "--tag", this.image, this.desktopDir], { timeoutMs: BUILD_TIMEOUT_MS }).then((res) => {
      const log = tail(`${res.stdout}\n${res.stderr}`);
      const ok = res.code === 0;
      this.build = {
        state: ok ? "done" : "failed",
        startedAt: this.build.startedAt,
        finishedAt: new Date().toISOString(),
        log,
        error: ok ? null : res.timedOut ? "the build took longer than 30 minutes" : res.code === null ? "Docker is not installed or not running" : tail(log, 3),
      };
    });
    return { started: true, build: this.buildState(), done };
  }
}
