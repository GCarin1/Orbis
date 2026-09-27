import {
  initialsOf,
  type Bot,
  type BotState,
  type Brain,
  type ComputerConfig,
  type Policy,
} from "@orbis/shared";
import { all, get, json, run, type Database, type Row } from "../db/index.js";

function toBot(r: Row): Bot {
  const name = r.name as string;
  return {
    id: r.id as string,
    handle: r.handle as string,
    name,
    role: r.role as string,
    description: r.description as string,
    avatar: { initials: initialsOf(name), color: r.avatar_color as string },
    brain: json<Brain>(r.brain, { kind: "mock" }),
    policy: json<Policy>(r.policy, { rules: [], grants: [] }),
    computer: json<ComputerConfig>(r.computer, { enabled: true }),
    skills: json<string[]>(r.skills, ["*"]),
    spendCapUsd: r.spend_cap_usd === null ? null : Number(r.spend_cap_usd),
    capIncludesSubscription: r.cap_includes_subscription === 1,
    pinned: r.pinned === 1,
    hidden: r.hidden === 1,
    state: r.state as BotState,
    lastMessage:
      r.last_message_at === null ? null : { text: r.last_message_text as string, at: r.last_message_at as string },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export class BotsRepo {
  constructor(private readonly db: Database) {}

  list(opts: { includeHidden?: boolean } = {}): Bot[] {
    const where = opts.includeHidden ? "" : "WHERE hidden = 0";
    return all(
      this.db,
      `SELECT * FROM bots ${where}
       ORDER BY pinned DESC, (last_message_at IS NULL) ASC, last_message_at DESC, name COLLATE NOCASE ASC`,
    ).map(toBot);
  }

  get(idOrHandle: string): Bot | undefined {
    const row = get(this.db, "SELECT * FROM bots WHERE id = ? OR handle = ?", idOrHandle, idOrHandle.replace(/^@/, ""));
    return row ? toBot(row) : undefined;
  }

  count(): number {
    return Number(get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM bots")!.n);
  }

  handleTaken(handle: string, exceptId?: string): boolean {
    const row = get(this.db, "SELECT id FROM bots WHERE handle = ?", handle);
    return row !== undefined && row.id !== exceptId;
  }

  insert(bot: Bot): void {
    run(
      this.db,
      `INSERT INTO bots (id, handle, name, role, description, avatar_color, brain, policy, computer, skills,
         spend_cap_usd, cap_includes_subscription, pinned, hidden, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bot.id,
      bot.handle,
      bot.name,
      bot.role,
      bot.description,
      bot.avatar.color,
      JSON.stringify(bot.brain),
      JSON.stringify(bot.policy),
      JSON.stringify(bot.computer),
      JSON.stringify(bot.skills),
      bot.spendCapUsd,
      bot.capIncludesSubscription ? 1 : 0,
      bot.pinned ? 1 : 0,
      bot.hidden ? 1 : 0,
      bot.state,
      bot.createdAt,
      bot.updatedAt,
    );
  }

  /** Persist every editable field of `bot`. */
  save(bot: Bot): void {
    run(
      this.db,
      `UPDATE bots SET handle = ?, name = ?, role = ?, description = ?, avatar_color = ?, brain = ?, policy = ?,
         computer = ?, skills = ?, spend_cap_usd = ?, cap_includes_subscription = ?, pinned = ?, hidden = ?,
         updated_at = ?
       WHERE id = ?`,
      bot.handle,
      bot.name,
      bot.role,
      bot.description,
      bot.avatar.color,
      JSON.stringify(bot.brain),
      JSON.stringify(bot.policy),
      JSON.stringify(bot.computer),
      JSON.stringify(bot.skills),
      bot.spendCapUsd,
      bot.capIncludesSubscription ? 1 : 0,
      bot.pinned ? 1 : 0,
      bot.hidden ? 1 : 0,
      bot.updatedAt,
      bot.id,
    );
  }

  setState(id: string, state: BotState): void {
    run(this.db, "UPDATE bots SET state = ? WHERE id = ?", state, id);
  }

  setLastMessage(id: string, text: string, at: string): void {
    run(this.db, "UPDATE bots SET last_message_text = ?, last_message_at = ? WHERE id = ?", text.slice(0, 280), at, id);
  }

  delete(id: string): void {
    run(this.db, "DELETE FROM bots WHERE id = ?", id);
  }
}
