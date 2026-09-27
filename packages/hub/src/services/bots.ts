// Bot lifecycle rules of specs/bots.
import {
  colorFor,
  initialsOf,
  isValidHandle,
  slugifyHandle,
  uniqueHandle,
  type Bot,
  type Brain,
  type ComputerConfig,
  type Policy,
} from "@orbis/shared";
import type { EventBus } from "../bus.js";
import type { HubConfig } from "../config.js";
import type { ComputerManager } from "../computer/manager.js";
import { transaction, type Database } from "../db/index.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import type { BotsRepo } from "../repos/bots.js";
import type { RunEngine } from "../runs/engine.js";

export interface BotInput {
  name: string;
  handle?: string;
  role?: string;
  description?: string;
  avatarColor?: string;
  brain?: Brain;
  policy?: Policy;
  computer?: ComputerConfig;
  tools?: string[];
  skills?: string[];
  spendCapUsd?: number | null;
  capIncludesSubscription?: boolean;
  pinned?: boolean;
  hidden?: boolean;
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
      avatar: { initials: initialsOf(name), color: input.avatarColor ?? colorFor(role || name) },
      brain: input.brain ?? DEFAULT_BRAIN,
      policy: input.policy ?? DEFAULT_POLICY,
      computer: input.computer ?? DEFAULT_COMPUTER,
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
    if (patch.brain !== undefined) bot.brain = patch.brain;
    if (patch.policy !== undefined) bot.policy = patch.policy;
    if (patch.computer !== undefined) bot.computer = patch.computer;
    if (patch.tools !== undefined) bot.tools = patch.tools;
    if (patch.skills !== undefined) bot.skills = patch.skills;
    if (patch.spendCapUsd !== undefined) bot.spendCapUsd = patch.spendCapUsd;
    if (patch.capIncludesSubscription !== undefined) bot.capIncludesSubscription = patch.capIncludesSubscription;
    if (patch.pinned !== undefined) bot.pinned = patch.pinned;
    if (patch.hidden !== undefined) bot.hidden = patch.hidden;
    bot.updatedAt = nowIso();
    this.d.bots.save(bot);
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
      brain: structuredClone(source.brain),
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
    transaction(this.d.db, () => this.d.bots.delete(bot.id));
    await this.d.computer.destroy(bot.id);
    this.d.bus.publish("bot.deleted", { botId: bot.id });
  }
}
