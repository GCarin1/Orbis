// Bot lifecycle rules of specs/bots.
import {
  colorFor,
  initialsOf,
  shapeFor,
  type AvatarShape,
  isValidHandle,
  slugifyHandle,
  uniqueHandle,
  type Bot,
  type BotInitiative,
  type Brain,
  type ComputerConfig,
  type Policy,
} from "@orbis/shared";
import type { EventBus } from "../bus.js";
import type { HubConfig } from "../config.js";
import type { ComputerManager } from "../computer/manager.js";
import { checkHostDir, HostFolderError } from "../computer/host.js";
import { transaction, type Database } from "../db/index.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import { DEFAULT_INITIATIVE, type BotsRepo } from "../repos/bots.js";
import type { RunEngine } from "../runs/engine.js";

export interface BotInput {
  name: string;
  handle?: string;
  role?: string;
  description?: string;
  avatarColor?: string;
  avatarShape?: AvatarShape;
  brain?: Brain;
  /** The manager's id or handle; null for none. */
  reportsTo?: string | null;
  policy?: Policy;
  computer?: ComputerConfig;
  tools?: string[];
  skills?: string[];
  spendCapUsd?: number | null;
  capIncludesSubscription?: boolean;
  pinned?: boolean;
  hidden?: boolean;
  /** Whether and how often the bot writes on its own (specs/bots: initiative). */
  initiative?: Partial<BotInitiative>;
}

export type BotPatch = Partial<BotInput>;

export const DEFAULT_BRAIN: Brain = { kind: "claude-code" };
export const DEFAULT_POLICY: Policy = { rules: [], grants: [] };
export const DEFAULT_COMPUTER: ComputerConfig = { enabled: true };

export interface BotServiceDeps {
  db: Database;
  config: HubConfig;
  bots: BotsRepo;
  bus: EventBus;
  engine: RunEngine;
  computer: ComputerManager;
}

export class BotService {
  /** Callbacks run inside the delete, before the row goes (secrets vault files, skills dirs...). */
  private readonly deleteHooks: Array<(bot: Bot) => void | Promise<void>> = [];

  constructor(private readonly d: BotServiceDeps) {}

  onDelete(hook: (bot: Bot) => void | Promise<void>): void {
    this.deleteHooks.push(hook);
  }

  list(includeHidden = false): Bot[] {
    return this.d.bots.list({ includeHidden });
  }

  get(idOrHandle: string): Bot {
    const bot = this.d.bots.get(idOrHandle);
    if (!bot) throw notFound(`bot ${idOrHandle}`);
    return bot;
  }

  private checkHandle(handle: string, exceptId?: string): void {
    if (!isValidHandle(handle)) {
      throw badRequest("invalid handle", {
        handle: "must be 2 to 32 characters from a-z, 0-9 and '-', and not 'everyone'",
      });
    }
    if (this.d.bots.handleTaken(handle, exceptId)) {
      throw conflict("handle_taken", `the handle @${handle} is already used`);
    }
  }

  /**
   * The manager a bot may report to: an existing other bot that does not
   * already report, directly or not, to this one.
   */
  private manager(ref: string | null | undefined, selfId?: string): string | null {
    if (ref === null || ref === undefined || ref === "") return null;
    const manager = this.d.bots.get(ref);
    if (!manager) throw badRequest("invalid bot", { reportsTo: `no bot ${ref}` });
    if (manager.id === selfId) throw badRequest("invalid bot", { reportsTo: "a bot cannot report to itself" });
    for (let up: string | null = manager.reportsTo, hops = 0; up && hops < 1000; hops++) {
      if (up === selfId) throw badRequest("invalid bot", { reportsTo: `@${manager.handle} already reports to this bot` });
      up = this.d.bots.get(up)?.reportsTo ?? null;
    }
    return manager.id;
  }

  /** A computer configuration as stored: a `host` folder must exist and is kept as a full path. */
  private computerConfig(computer: ComputerConfig): ComputerConfig {
    if (computer.provider !== "host" || computer.hostDir === undefined) return computer;
    try {
      return { ...computer, hostDir: checkHostDir(computer.hostDir.trim()) };
    } catch (err) {
      if (err instanceof HostFolderError) throw badRequest("invalid computer", { "computer.hostDir": err.message });
      throw err;
    }
  }

  create(input: BotInput): Bot {
    if (this.d.bots.count() >= this.d.config.maxBots) {
      throw conflict("limit_reached", `this installation already holds the maximum of ${this.d.config.maxBots} bots`);
    }
    const name = input.name.trim();
    if (!name) throw badRequest("invalid bot", { name: "must not be empty" });
    let handle: string;
    if (input.handle !== undefined) {
      handle = input.handle;
      this.checkHandle(handle);
    } else {
      handle = uniqueHandle(slugifyHandle(name), (h) => this.d.bots.handleTaken(h));
    }
    const role = (input.role ?? "").trim();
    const at = nowIso();
    const bot: Bot = {
      id: newId("bot"),
      handle,
      name,
      role,
      description: input.description ?? "",
      avatar: { initials: initialsOf(name), color: input.avatarColor ?? colorFor(role || name), shape: input.avatarShape ?? shapeFor(name) },
      brain: input.brain ?? DEFAULT_BRAIN,
      reportsTo: this.manager(input.reportsTo),
      squadId: null,
      policy: input.policy ?? DEFAULT_POLICY,
      computer: input.computer ? this.computerConfig(input.computer) : DEFAULT_COMPUTER,
      tools: input.tools ?? ["*"],
      skills: input.skills ?? ["*"],
      spendCapUsd: input.spendCapUsd ?? null,
      capIncludesSubscription: input.capIncludesSubscription ?? false,
      pinned: input.pinned ?? false,
      hidden: input.hidden ?? false,
      state: "idle",
      lastMessage: null,
      createdAt: at,
      updatedAt: at,
    };
    this.d.bots.insert(bot);
    if (input.initiative) this.d.bots.setInitiative(bot.id, { ...DEFAULT_INITIATIVE, ...input.initiative });
    this.d.computer.ensureWorkspace(bot.id);
    const saved = this.get(bot.id);
    this.d.bus.publish("bot.updated", { bot: saved });
    return saved;
  }

  update(idOrHandle: string, patch: BotPatch): Bot {
    const bot = this.get(idOrHandle);
    if (patch.handle !== undefined && patch.handle !== bot.handle) {
      this.checkHandle(patch.handle, bot.id);
      bot.handle = patch.handle;
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw badRequest("invalid bot", { name: "must not be empty" });
      bot.name = name;
    }
    if (patch.role !== undefined) bot.role = patch.role.trim();
    if (patch.description !== undefined) bot.description = patch.description;
    if (patch.avatarColor !== undefined) bot.avatar.color = patch.avatarColor;
    if (patch.avatarShape !== undefined) bot.avatar.shape = patch.avatarShape;
    if (patch.brain !== undefined) bot.brain = patch.brain;
    if (patch.reportsTo !== undefined) bot.reportsTo = this.manager(patch.reportsTo, bot.id);
    if (patch.policy !== undefined) bot.policy = patch.policy;
    if (patch.computer !== undefined) {
      const before = { ...bot, computer: bot.computer };
      bot.computer = this.computerConfig(patch.computer);
      // Moving to another kind of computer stops the old one (its disk is kept).
      if (this.d.computer.providerKind(before) !== this.d.computer.providerKind(bot)) void this.d.computer.stop(before).catch(() => undefined);
    }
    if (patch.tools !== undefined) bot.tools = patch.tools;
    if (patch.skills !== undefined) bot.skills = patch.skills;
    if (patch.spendCapUsd !== undefined) bot.spendCapUsd = patch.spendCapUsd;
    if (patch.capIncludesSubscription !== undefined) bot.capIncludesSubscription = patch.capIncludesSubscription;
    if (patch.pinned !== undefined) bot.pinned = patch.pinned;
    if (patch.hidden !== undefined) bot.hidden = patch.hidden;
    bot.updatedAt = nowIso();
    this.d.bots.save(bot);
    if (patch.initiative !== undefined) this.d.bots.setInitiative(bot.id, { ...DEFAULT_INITIATIVE, ...bot.initiative, ...patch.initiative });
    const saved = this.get(bot.id);
    this.d.bus.publish("bot.updated", { bot: saved });
    return saved;
  }

  duplicate(idOrHandle: string): Bot {
    const source = this.get(idOrHandle);
    return this.create({
      name: `${source.name} (copy)`,
      role: source.role,
      description: source.description,
      avatarColor: source.avatar.color,
      avatarShape: source.avatar.shape,
      brain: structuredClone(source.brain),
      reportsTo: source.reportsTo,
      policy: { rules: structuredClone(source.policy.rules), grants: [] },
      computer: structuredClone(source.computer),
      tools: [...source.tools],
      skills: [...source.skills],
      spendCapUsd: source.spendCapUsd,
      capIncludesSubscription: source.capIncludesSubscription,
    });
  }

  /**
   * Delete a bot and everything it owns: runs are cancelled first, then the
   * row goes (memory, routines, secrets, runs, sessions, its direct
   * conversation and its group memberships cascade), then its computer.
   */
  async delete(idOrHandle: string): Promise<void> {
    const bot = this.get(idOrHandle);
    const active = this.d.engine.activeRuns(bot.id);
    this.d.engine.cancelBot(bot.id);
    await Promise.all(active.map((r) => this.d.engine.wait(r.id)));
    for (const hook of this.deleteHooks) await hook(bot);
    // Its reports now report to its own manager, so the team stays connected.
    const reports = this.d.bots.reportsOf(bot.id);
    transaction(this.d.db, () => {
      this.d.bots.reassignReports(bot.id, bot.reportsTo);
      this.d.bots.delete(bot.id);
    });
    for (const report of reports) this.d.bus.publish("bot.updated", { bot: this.get(report.id) });
    await this.d.computer.destroy(bot);
    this.d.bus.publish("bot.deleted", { botId: bot.id });
  }
}
