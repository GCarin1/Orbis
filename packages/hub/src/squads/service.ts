// Squads (specs/squads, ADR 0016): bots organized under a name, each in one squad. A squad's members
// report to its representative, and the representative to the squad's manager (one manager may take every
// squad), so the team's delegation and report-back follow the squads. Each squad has its own group from two
// members, and the representatives and managers share a room; `@handle` of a squad reaches its representative.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { AVATAR_COLORS, colorFor, isValidHandle, roleSlug, slugifyHandle, type Bot, type Squad, type SquadsView } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run, transaction, type Row } from "../db/index.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import { SettingsRepo } from "../repos/settings.js";
import type { ToolDefinition } from "../tools/registry.js";
import { IdParams } from "../api/schemas.js";

const ROOM_KEY = "squads.room";
/** The bots' palette, bright colors first: a new squad takes the first one no squad wears. */
const SQUAD_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444", "#f59e0b"].filter((c) =>
  (AVATAR_COLORS as readonly string[]).includes(c),
);
const label = (bot: Bot) => `@${bot.handle} (${bot.name}${bot.role ? `, ${bot.role}` : ""})`;

export interface SquadInput {
  name: string;
  description?: string;
  color?: string;
  /** Bot ids or handles; a bot in another squad moves. */
  members?: string[];
  representativeId?: string | null;
  managerId?: string | null;
}

export class SquadService {
  private readonly settings: SettingsRepo;

  constructor(private readonly hub: HubContext) {
    this.settings = new SettingsRepo(hub.db);
  }

  // --- reading ---------------------------------------------------------------

  private toSquad(r: Row): Squad {
    const members = all(this.hub.db, "SELECT id FROM bots WHERE squad_id = ? ORDER BY name COLLATE NOCASE, id", r.id as string).map((m) => m.id as string);
    return {
      id: r.id as string,
      name: r.name as string,
      handle: r.handle as string,
      description: r.description as string,
      color: r.color as string,
      representativeId: (r.representative_id as string | null) ?? null,
      managerId: (r.manager_id as string | null) ?? null,
      conversationId: (r.conversation_id as string | null) ?? null,
      members,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  list(): Squad[] {
    return all(this.hub.db, "SELECT * FROM squads ORDER BY created_at, rowid").map((r) => this.toSquad(r));
  }

  get(ref: string): Squad {
    const row = get(this.hub.db, "SELECT * FROM squads WHERE id = ? OR handle = ?", ref, ref.replace(/^@/, "").toLowerCase());
    if (!row) throw notFound(`squad ${ref}`);
    return this.toSquad(row);
  }

  view(): SquadsView {
    const roomId = this.settings.get(ROOM_KEY);
    return { squads: this.list(), roomId: roomId && this.hub.repos.conversations.get(roomId) ? roomId : null };
  }

  /** `@handle` of each squad names its representative. */
  aliases(): Record<string, string> {
    return Object.fromEntries(this.list().flatMap((s) => (s.representativeId ? [[s.handle, s.representativeId]] : [])));
  }

  // --- writing ---------------------------------------------------------------

  private bot(ref: string, field: string): Bot {
    const bot = this.hub.repos.bots.get(ref);
    if (!bot) throw badRequest("invalid squad", { [field]: `no bot ${ref}` });
    return bot;
  }

  /** A handle for a squad: from its name, unused by any other squad, bot handle or role. */
  private handleFor(name: string, exceptId?: string): string {
    const base = slugifyHandle(name) || "squad";
    const taken = (h: string) =>
      Boolean(get(this.hub.db, "SELECT id FROM squads WHERE handle = ? AND id != ?", h, exceptId ?? "")) ||
      this.hub.repos.bots.list({ includeHidden: true }).some((b) => b.handle === h || roleSlug(b.role) === h);
    for (const candidate of [base, `${base}-squad`]) if (isValidHandle(candidate) && !taken(candidate)) return candidate;
    for (let n = 2; ; n++) {
      const candidate = `${base.slice(0, 28)}-${n}`;
      if (isValidHandle(candidate) && !taken(candidate)) return candidate;
    }
  }

  /** A color no squad wears yet, so squads tell apart at a glance; the name's color once all are taken. */
  private freeColor(name: string): string {
    const used = new Set(this.list().map((s) => s.color.toLowerCase()));
    return SQUAD_COLORS.find((c) => !used.has(c.toLowerCase())) ?? colorFor(name);
  }

  create(input: SquadInput): SquadsView {
    const name = input.name.trim();
    if (!name) throw badRequest("invalid squad", { name: "must not be empty" });
    const members = (input.members ?? []).map((m) => this.bot(m, "members"));
    const at = nowIso();
    const id = newId("sqd");
    run(
      this.hub.db,
      "INSERT INTO squads (id, name, handle, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      this.handleFor(name),
      (input.description ?? "").trim(),
      input.color ?? this.freeColor(name),
      at,
      at,
    );
    try {
      this.change(() => {
        for (const bot of members) this.hub.repos.bots.setSquad(bot.id, id);
        this.setRoles(id, { representativeId: input.representativeId, managerId: input.managerId });
      });
    } catch (err) {
      run(this.hub.db, "DELETE FROM squads WHERE id = ?", id);
      for (const bot of members) this.hub.repos.bots.setSquad(bot.id, bot.squadId);
      throw err;
    }
    return this.view();
  }

  update(ref: string, patch: Omit<Partial<SquadInput>, "members">): SquadsView {
    const squad = this.get(ref);
    const fields: Record<string, string> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw badRequest("invalid squad", { name: "must not be empty" });
      fields.name = name;
      if (name !== squad.name) fields.handle = this.handleFor(name, squad.id);
    }
    if (patch.description !== undefined) fields.description = patch.description.trim();
    if (patch.color !== undefined) fields.color = patch.color;
    this.change(() => {
      const keys = Object.keys(fields);
      if (keys.length) {
        run(
          this.hub.db,
          `UPDATE squads SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
          ...keys.map((k) => fields[k]!),
          nowIso(),
          squad.id,
        );
      }
      if (patch.representativeId !== undefined || patch.managerId !== undefined) {
        this.setRoles(squad.id, { representativeId: patch.representativeId, managerId: patch.managerId });
      }
    });
    return this.view();
  }

  /** Put a bot in a squad, out of the one it was in. */
  addMember(ref: string, botRef: string): SquadsView {
    const squad = this.get(ref);
    const bot = this.hub.botService.get(botRef);
    if (bot.squadId === squad.id) throw conflict("already_member", `@${bot.handle} is already in the squad ${squad.name}`);
    if (squad.managerId === bot.id) throw badRequest("invalid squad", { botId: `@${bot.handle} manages this squad: choose another manager first` });
    this.change(() => this.hub.repos.bots.setSquad(bot.id, squad.id));
    return this.view();
  }

  removeMember(ref: string, botRef: string): SquadsView {
    const squad = this.get(ref);
    const bot = this.hub.botService.get(botRef);
    if (bot.squadId !== squad.id) throw notFound(`@${bot.handle} in the squad ${squad.name}`);
    this.change(() => this.hub.repos.bots.setSquad(bot.id, null));
    return this.view();
  }

  /** One manager for every squad (or none). */
  setManagerOfAll(managerRef: string | null): SquadsView {
    const manager = managerRef ? this.bot(managerRef, "managerId") : null;
    this.change(() => {
      for (const squad of this.list()) {
        if (manager && squad.members.includes(manager.id)) continue; // a member never manages its own squad
        run(this.hub.db, "UPDATE squads SET manager_id = ?, updated_at = ? WHERE id = ?", manager?.id ?? null, nowIso(), squad.id);
      }
    });
    return this.view();
  }

  delete(ref: string): SquadsView {
    const squad = this.get(ref);
    this.change(() => {
      for (const id of squad.members) this.hub.repos.bots.setSquad(id, null);
      run(this.hub.db, "DELETE FROM squads WHERE id = ?", squad.id);
    });
    return this.view();
  }

  private setRoles(squadId: string, roles: { representativeId?: string | null; managerId?: string | null }): void {
    const squad = this.get(squadId);
    if (roles.representativeId !== undefined) {
      const rep = roles.representativeId ? this.bot(roles.representativeId, "representativeId") : null;
      if (rep && !squad.members.includes(rep.id)) throw badRequest("invalid squad", { representativeId: `@${rep.handle} is not in this squad` });
      run(this.hub.db, "UPDATE squads SET representative_id = ?, updated_at = ? WHERE id = ?", rep?.id ?? null, nowIso(), squadId);
    }
    if (roles.managerId !== undefined) {
      const manager = roles.managerId ? this.bot(roles.managerId, "managerId") : null;
      if (manager && squad.members.includes(manager.id)) {
        throw badRequest("invalid squad", { managerId: `@${manager.handle} is in this squad: its manager is a bot outside it` });
      }
      run(this.hub.db, "UPDATE squads SET manager_id = ?, updated_at = ? WHERE id = ?", manager?.id ?? null, nowIso(), squadId);
    }
  }

  // --- keeping the team in step ------------------------------------------------

  /**
   * Make a change, then: give every squad a representative among its members, check that nobody would
   * report to itself, write who reports to whom, keep the squads' groups and the room, and tell the clients.
   * A change that would make a loop is undone.
   */
  private change(fn: () => void): void {
    const before = new Map(this.hub.repos.bots.list({ includeHidden: true }).map((b) => [b.id, b]));
    const squadsBefore = this.list();
    let reports: Map<string, string | null>;
    transaction(this.hub.db, () => {
      fn();
      for (const squad of this.list()) {
        // A representative left (or never was): the first member takes it.
        if (squad.representativeId && squad.members.includes(squad.representativeId)) continue;
        run(this.hub.db, "UPDATE squads SET representative_id = ? WHERE id = ?", squad.members[0] ?? null, squad.id);
      }
      reports = this.plan(before, squadsBefore);
    });
    const changed: string[] = [];
    for (const [botId, reportsTo] of reports!) {
      const bot = this.hub.repos.bots.get(botId);
      if (!bot || bot.reportsTo === reportsTo) continue;
      this.hub.repos.bots.save({ ...bot, reportsTo, updatedAt: nowIso() });
      changed.push(botId);
    }
    for (const bot of this.hub.repos.bots.list({ includeHidden: true })) {
      if (changed.includes(bot.id) || before.get(bot.id)?.squadId !== bot.squadId) this.hub.bus.publish("bot.updated", { bot });
    }
    this.syncGroups();
    this.hub.bus.publish("squads.updated", this.view());
  }

  /**
   * Who each bot reports to after a change: a member to its squad's representative, a representative to
   * its squad's manager. A bot that left a squad stops reporting to the one it reported to as a member or
   * as the representative. Every other bot keeps its manager. Throws on a loop.
   */
  private plan(before: Map<string, Bot>, squadsBefore: Squad[]): Map<string, string | null> {
    const squads = this.list();
    const next = new Map<string, string | null>();
    for (const squad of squads) {
      const rep = squad.representativeId;
      for (const id of squad.members) next.set(id, id === rep ? squad.managerId : rep);
    }
    for (const old of squadsBefore) {
      for (const id of old.members) {
        if (next.has(id)) continue;
        const reportsTo = before.get(id)?.reportsTo ?? null;
        const wasSquadLink = id === old.representativeId ? reportsTo === old.managerId : reportsTo === old.representativeId;
        if (wasSquadLink) next.set(id, null);
      }
    }
    const reportsOf = (id: string) => (next.has(id) ? next.get(id)! : (before.get(id)?.reportsTo ?? null));
    for (const id of next.keys()) {
      const seen = new Set<string>([id]);
      for (let up = reportsOf(id); up; up = reportsOf(up)) {
        if (seen.has(up)) {
          const bot = before.get(id);
          throw badRequest("invalid squad", { managerId: `this would make @${bot?.handle ?? id} report to itself, through ${[...seen].length} bots` });
        }
        seen.add(up);
      }
    }
    return next;
  }

  /** Each squad's group holds its members (from two of them), led by its representative; the room, every representative and manager. */
  private syncGroups(): void {
    for (const squad of this.list()) {
      const id = this.safely(squad.conversationId, () =>
        this.syncGroup(squad.conversationId, squad.members, squad.representativeId, squad.name, `Squad ${squad.name} (@${squad.handle}).`),
      );
      if (id !== squad.conversationId) run(this.hub.db, "UPDATE squads SET conversation_id = ? WHERE id = ?", id, squad.id);
    }
    const squads = this.list();
    const managers = [...new Set(squads.map((s) => s.managerId).filter((m): m is string => m !== null))];
    const reps = squads.map((s) => s.representativeId).filter((r): r is string => r !== null);
    const members = [...new Set([...managers, ...reps])];
    const roomId = this.settings.get(ROOM_KEY);
    const lead = managers.length === 1 ? managers[0]! : (reps[0] ?? null);
    const room = this.safely(roomId, () => this.syncGroup(roomId, squads.length ? members : [], lead, "Squads", "The squads' representatives and managers."));
    if (room) this.settings.set(ROOM_KEY, room);
    else if (roomId) this.settings.delete(ROOM_KEY);
  }

  /** A group the user changed by hand may refuse a member (full): the squad change stands, the group stays as it is. */
  private safely(id: string | null, sync: () => string | null): string | null {
    try {
      return sync();
    } catch {
      return id;
    }
  }

  /** Keep a group to `wanted` bots (as many as a group holds): create it from two, add, remove, lead, rename. */
  private syncGroup(id: string | null, wanted: string[], lead: string | null, title: string, description: string): string | null {
    const conversations = this.hub.conversationService;
    const max = this.hub.config.maxGroupSize;
    const members = wanted.slice(0, max);
    const group = id ? this.hub.repos.conversations.get(id) : undefined;
    if (!group) {
      if (members.length < 2) return null;
      const created = conversations.createGroup({ title, members, leadBotId: lead && members.includes(lead) ? lead : members[0]!, description });
      return created.id;
    }
    if (members.length === 0) return group.id; // nobody left: the group stays as it was, for its history
    for (const botId of members) if (!this.hub.repos.conversations.get(group.id)!.members.includes(botId)) conversations.addMember(group.id, botId);
    for (const botId of group.members) {
      if (!members.includes(botId) && this.hub.repos.conversations.get(group.id)!.members.length > 1) conversations.removeMember(group.id, botId);
    }
    const now = this.hub.repos.conversations.get(group.id)!;
    const patch: { title?: string; leadBotId?: string } = {};
    if (now.title !== title) patch.title = title;
    if (lead && now.members.includes(lead) && now.leadBotId !== lead) patch.leadBotId = lead;
    if (Object.keys(patch).length) conversations.updateGroup(group.id, patch);
    return group.id;
  }

  /** A bot is being deleted: it leaves its squad and the squads it manages, and the team is set again without it. */
  botDeleted(bot: Bot): void {
    const manages = this.list().filter((s) => s.managerId === bot.id);
    if (!bot.squadId && manages.length === 0) return;
    this.change(() => {
      if (bot.squadId) this.hub.repos.bots.setSquad(bot.id, null);
      for (const squad of manages) run(this.hub.db, "UPDATE squads SET manager_id = NULL WHERE id = ?", squad.id);
    });
  }

  // --- what bots know ----------------------------------------------------------

  /** The squads, for a bot's context: its own, its role in it, the others and how to reach them. */
  contextSection(bot: Bot): string | null {
    const squads = this.list();
    if (squads.length === 0) return null;
    const bots = new Map(this.hub.repos.bots.list({ includeHidden: true }).map((b) => [b.id, b]));
    const who = (id: string | null) => (id && bots.get(id) ? `@${bots.get(id)!.handle}` : "nobody");
    const mine = squads.find((s) => s.id === bot.squadId);
    const represents = mine && mine.representativeId === bot.id;
    const manages = squads.filter((s) => s.managerId === bot.id);
    const lines = ["Squads:"];
    if (mine) {
      lines.push(
        `- You are in the squad "${mine.name}" (@${mine.handle}). Its representative is ${represents ? "you" : who(mine.representativeId)}; its manager is ${who(mine.managerId)}.`,
        `- Your squad: ${
          mine.members
            .filter((id) => id !== bot.id)
            .map((id) => (bots.get(id) ? label(bots.get(id)!) : id))
            .join("; ") || "only you"
        }.`,
      );
    } else lines.push("- You are in no squad.");
    if (manages.length)
      lines.push(`- You manage the squads ${manages.map((s) => `"${s.name}" (@${s.handle}, representative ${who(s.representativeId)})`).join(", ")}.`);
    const others = squads.filter((s) => s.id !== mine?.id);
    if (others.length) {
      lines.push(
        `- Other squads: ${others.map((s) => `"${s.name}" (@${s.handle}): representative ${who(s.representativeId)}, ${s.members.length} bots${s.description ? ` — ${s.description}` : ""}`).join("; ")}.`,
      );
    }
    lines.push(
      "How squads work:",
      "- To ask another squad for something, hand it off to the squad's handle with team.handoff (to @handle): its representative receives it and shares it in the squad. In a group, @handle wakes the representative.",
    );
    if (represents)
      lines.push(
        "- You speak for your squad: work from your manager and from other squads comes to you; split it among your squad with team.handoff and report back.",
      );
    if (manages.length) lines.push("- Delegate to the squads you manage through their representatives.");
    lines.push('- Any bot\'s enabled routines can be called with routine.call; routine.list with bot "all" lists them.');
    return lines.join("\n");
  }

  /** `team.list_squads`: the squads with their handle, representative, manager and members. */
  tools(): ToolDefinition[] {
    return [
      {
        name: "team.list_squads",
        description:
          "List the squads of this Orbis team: name, handle (hand work to @handle to reach its representative), representative, manager and members.",
        input: Type.Object({}),
        risk: "read",
        handler: async () => {
          const bots = new Map(this.hub.repos.bots.list({ includeHidden: true }).map((b) => [b.id, b]));
          const handle = (id: string | null) => (id && bots.get(id) ? bots.get(id)!.handle : null);
          const squads = this.list();
          if (squads.length === 0) return "there are no squads";
          return JSON.stringify(
            squads.map((s) => ({
              name: s.name,
              handle: s.handle,
              description: s.description,
              representative: handle(s.representativeId),
              manager: handle(s.managerId),
              members: s.members.map(handle),
            })),
            null,
            2,
          );
        },
      },
    ];
  }

  // --- routes -----------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Color = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
    const Ref = Type.Union([Type.String({ minLength: 1 }), Type.Null()]);
    const Create = Type.Object(
      {
        name: Type.String({ minLength: 1, maxLength: 60 }),
        description: Type.Optional(Type.String({ maxLength: 1000 })),
        color: Type.Optional(Color),
        members: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 200 })),
        representativeId: Type.Optional(Ref),
        managerId: Type.Optional(Ref),
      },
      { additionalProperties: false },
    );
    const Patch = Type.Object(
      {
        name: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
        description: Type.Optional(Type.String({ maxLength: 1000 })),
        color: Type.Optional(Color),
        representativeId: Type.Optional(Ref),
        managerId: Type.Optional(Ref),
      },
      { additionalProperties: false },
    );
    const Member = Type.Object({ id: Type.String({ minLength: 1 }), botId: Type.String({ minLength: 1 }) });

    app.get("/api/v1/squads", { schema: { tags: ["squads"] } }, async () => this.view());
    app.post("/api/v1/squads", { schema: { tags: ["squads"], body: Create } }, async (req, reply) => {
      reply.code(201);
      return this.create(req.body);
    });
    app.patch("/api/v1/squads/:id", { schema: { tags: ["squads"], params: IdParams, body: Patch } }, async (req) => this.update(req.params.id, req.body));
    app.delete("/api/v1/squads/:id", { schema: { tags: ["squads"], params: IdParams } }, async (req) => this.delete(req.params.id));
    app.put("/api/v1/squads/:id/members/:botId", { schema: { tags: ["squads"], params: Member } }, async (req) =>
      this.addMember(req.params.id, req.params.botId),
    );
    app.delete("/api/v1/squads/:id/members/:botId", { schema: { tags: ["squads"], params: Member } }, async (req) =>
      this.removeMember(req.params.id, req.params.botId),
    );
    app.post("/api/v1/squads/manager", { schema: { tags: ["squads"], body: Type.Object({ managerId: Ref }, { additionalProperties: false }) } }, async (req) =>
      this.setManagerOfAll(req.body.managerId),
    );
  }
}
