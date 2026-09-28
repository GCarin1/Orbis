// One computer per bot behind a provider interface (ADR 0005, specs/computer).
// The manager starts a computer when a tool needs it, records its last use,
// hibernates it after the idle period, holds takeovers, and destroys it with
// its bot.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Bot, ComputerProviderKind, ComputerState, ComputerStatus } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import { checkHostDir, HostProvider, hostDir } from "./host.js";
import { LocalProvider } from "./local.js";
import { SHELL_OUTPUT_CAP, type ComputerPaths, type ComputerProvider, type ExecOptions, type ExecResult } from "./provider.js";

export type { ComputerProvider } from "./provider.js";

export const DEFAULT_HIBERNATE_AFTER_MIN = 30;
const BUILTIN_PROVIDERS = new Set(["local", "host", "docker"]);

interface Slot {
  state: ComputerState;
  provider: string;
  lastUsedAt: number | null;
  takeover: boolean;
  screenshotAt: number | null;
  /** Resolvers of tool calls waiting for the user to hand control back. */
  waiters: Set<() => void>;
}

export interface ComputerManagerOptions {
  defaultProvider?: ComputerProviderKind;
  /** Providers by kind; `local` and `host` are always available. Providers of other kinds are only destroyed with a bot. */
  providers?: ComputerProvider[];
  bus?: EventBus;
  bots?: { get(id: string): Bot | undefined };
  now?: () => number;
}

/** Things that run on a bot's computer and must stop with it (the browser). */
export interface ComputerAttachment {
  stop(botId: string): Promise<void>;
}

export class ComputerDisabledError extends Error {
  constructor(bot: Bot) {
    super(`@${bot.handle} has no computer: it is disabled in the bot's settings`);
  }
}

export class ComputerManager {
  private readonly providers = new Map<string, ComputerProvider>();
  private readonly slots = new Map<string, Slot>();
  private readonly starting = new Map<string, Promise<void>>();
  private readonly attachments: ComputerAttachment[] = [];
  private readonly defaultProvider: ComputerProviderKind;
  private readonly bus?: EventBus;
  private readonly bots?: { get(id: string): Bot | undefined };
  private readonly now: () => number;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataDir: string,
    opts: ComputerManagerOptions = {},
  ) {
    this.providers.set("local", new LocalProvider());
    this.providers.set("host", new HostProvider());
    for (const provider of opts.providers ?? []) this.providers.set(provider.kind, provider);
    this.defaultProvider = opts.defaultProvider ?? "local";
    this.bus = opts.bus;
    this.bots = opts.bots;
    this.now = opts.now ?? Date.now;
  }

  attach(attachment: ComputerAttachment): void {
    this.attachments.push(attachment);
  }

  // --- paths ------------------------------------------------------------------

  /** Root directory of everything a bot owns on disk. */
  botDir(botId: string): string {
    return path.join(this.dataDir, "bots", botId);
  }

  workspaceDir(botId: string): string {
    return path.join(this.botDir(botId), "workspace");
  }

  paths(botId: string): ComputerPaths {
    return {
      workspace: this.workspaceDir(botId),
      home: path.join(this.botDir(botId), "home"),
      browserProfile: path.join(this.botDir(botId), "browser-profile"),
    };
  }

  /** Create the bot's workspace if missing and return its path. */
  ensureWorkspace(botId: string): string {
    const dir = this.workspaceDir(botId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  /**
   * Where the bot works — commands, file tools, CLI brains: the folder the
   * user chose on their machine for `host`, else the bot's own workspace.
   */
  workDir(bot: Bot): string {
    if (this.providerKind(bot) === "host") return checkHostDir(hostDir(bot));
    return this.ensureWorkspace(bot.id);
  }

  /** What the bot is told about its computer, in every run's system text. */
  contextSection(bot: Bot): string | null {
    if (!bot.computer.enabled) return null;
    switch (this.providerKind(bot)) {
      case "host":
        return [
          `Your computer is the user's own machine (${process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux"}). You work in ${hostDir(bot)}: commands run there with the user's programs, and file tools reach only that folder.`,
          "These are the user's real files: never delete or overwrite anything you did not create unless the user asked, and say what you changed. Your browser opens as a window on the user's screen.",
        ].join(" ");
      case "docker":
        return "Your computer is a Linux container of your own with a desktop, Chromium and a terminal; the user can watch it live and take over. Your workspace folder is shared with the user.";
      default:
        return "Your computer is a private folder of your own on the Orbis machine: commands and file tools work inside it, and your browser runs without a window.";
    }
  }

  // --- lifecycle ----------------------------------------------------------------

  providerKind(bot: Bot): string {
    return bot.computer.provider ?? this.defaultProvider;
  }

  provider(bot: Bot): ComputerProvider {
    const kind = this.providerKind(bot);
    const provider = this.providers.get(kind);
    if (!provider) throw new Error(`computer provider "${kind}" is not available on this hub`);
    return provider;
  }

  private slot(botId: string): Slot {
    let slot = this.slots.get(botId);
    if (!slot) {
      slot = { state: "stopped", provider: "", lastUsedAt: null, takeover: false, screenshotAt: null, waiters: new Set() };
      this.slots.set(botId, slot);
    }
    return slot;
  }

  status(bot: Bot): ComputerStatus {
    const slot = this.slots.get(bot.id);
    const kind = this.providerKind(bot) as ComputerProviderKind;
    const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
    return {
      botId: bot.id,
      enabled: bot.computer.enabled,
      provider: kind,
      status: slot?.state ?? "stopped",
      takeover: slot?.takeover ?? false,
      vncPath: kind === "docker" && slot?.state === "running" ? `/api/v1/bots/${bot.id}/computer/vnc/vnc.html` : null,
      lastUsedAt: iso(slot?.lastUsedAt),
      screenshotAt: iso(slot?.screenshotAt),
    };
  }

  private publish(bot: Bot): void {
    this.bus?.publish("computer.updated", { botId: bot.id, computer: this.status(bot) });
  }

  /** Start the bot's computer if it is not running; every tool goes through here. */
  async ensure(bot: Bot): Promise<ComputerProvider> {
    if (!bot.computer.enabled) throw new ComputerDisabledError(bot);
    const provider = this.provider(bot);
    const slot = this.slot(bot.id);
    slot.lastUsedAt = this.now();
    if (slot.state === "running" && slot.provider === provider.kind) return provider;
    let pending = this.starting.get(bot.id);
    if (!pending) {
      pending = (async () => {
        this.ensureWorkspace(bot.id);
        await provider.ensure(bot, this.paths(bot.id));
        slot.state = "running";
        slot.provider = provider.kind;
        this.publish(bot);
      })().finally(() => this.starting.delete(bot.id));
      this.starting.set(bot.id, pending);
    }
    await pending;
    return provider;
  }

  touch(botId: string): void {
    const slot = this.slots.get(botId);
    if (slot) slot.lastUsedAt = this.now();
  }

  async exec(bot: Bot, command: string, opts: Partial<ExecOptions> & { timeoutMs: number }): Promise<ExecResult> {
    const provider = await this.ensure(bot);
    try {
      return await provider.exec(bot, this.paths(bot.id), command, { outputCap: SHELL_OUTPUT_CAP, ...opts });
    } finally {
      this.touch(bot.id);
    }
  }

  /** Stop the computer and keep its disk. `hibernated` when idle, `stopped` when asked. */
  async stop(bot: Bot, to: "stopped" | "hibernated" = "stopped"): Promise<void> {
    const slot = this.slot(bot.id);
    for (const attachment of this.attachments) await attachment.stop(bot.id).catch(() => undefined);
    if (slot.state === "running") await this.provider(bot).stop(bot.id);
    slot.state = to;
    this.publish(bot);
  }

  /** Hibernate every running computer idle for longer than its bot's `hibernateAfterMin`. */
  async sweep(now = this.now()): Promise<string[]> {
    const stopped: string[] = [];
    for (const [botId, slot] of this.slots) {
      if (slot.state !== "running" || slot.takeover || this.starting.has(botId)) continue;
      const bot = this.bots?.get(botId);
      if (!bot) continue;
      const idleMs = (bot.computer.hibernateAfterMin ?? DEFAULT_HIBERNATE_AFTER_MIN) * 60_000;
      if (slot.lastUsedAt !== null && now - slot.lastUsedAt > idleMs) {
        await this.stop(bot, "hibernated").catch(() => undefined);
        stopped.push(botId);
      }
    }
    return stopped;
  }

  startSweeper(intervalMs = 60_000): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => void this.sweep().catch(() => undefined), intervalMs);
    this.sweeper.unref();
  }

  /** Stop every running computer (hub shutdown). Disks are kept. */
  async shutdown(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const [botId, slot] of this.slots) {
      for (const waiter of slot.waiters) waiter();
      slot.waiters.clear();
      for (const attachment of this.attachments) await attachment.stop(botId).catch(() => undefined);
    }
  }

  // --- takeover ------------------------------------------------------------------

  takeover(bot: Bot): ComputerStatus {
    this.slot(bot.id).takeover = true;
    this.publish(bot);
    return this.status(bot);
  }

  release(bot: Bot): ComputerStatus {
    const slot = this.slot(bot.id);
    slot.takeover = false;
    slot.lastUsedAt = this.now();
    for (const waiter of slot.waiters) waiter();
    slot.waiters.clear();
    this.publish(bot);
    return this.status(bot);
  }

  holdsTakeover(botId: string): boolean {
    return this.slots.get(botId)?.takeover ?? false;
  }

  /** Resolve once the user does not hold the bot's computer (at once when nobody does). */
  waitForControl(botId: string, signal?: AbortSignal): Promise<void> {
    const slot = this.slots.get(botId);
    if (!slot?.takeover) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        slot.waiters.delete(done);
        reject(signal?.reason instanceof Error ? signal.reason : new Error("cancelled"));
      };
      if (signal?.aborted) return onAbort();
      slot.waiters.add(done);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  // --- live view -------------------------------------------------------------------

  screenshotTaken(bot: Bot): void {
    this.slot(bot.id).screenshotAt = this.now();
    this.publish(bot);
  }

  // --- destroy ---------------------------------------------------------------------

  /**
   * Destroy the bot's computer: its provider's container and volume (and
   * whatever extra providers hold), its browser, then its directories.
   */
  async destroy(bot: Bot): Promise<void> {
    const slot = this.slots.get(bot.id);
    for (const waiter of slot?.waiters ?? []) waiter();
    this.slots.delete(bot.id);
    for (const attachment of this.attachments) await attachment.stop(bot.id).catch(() => undefined);
    const kind = this.providerKind(bot);
    for (const provider of this.providers.values()) {
      if (provider.kind === kind || !BUILTIN_PROVIDERS.has(provider.kind)) await provider.destroy(bot.id);
    }
    rmSync(this.botDir(bot.id), { recursive: true, force: true });
  }
}
