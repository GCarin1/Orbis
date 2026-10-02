import type { Run, RunStatus, RunTrigger, Step, Usage } from "@orbis/shared";
import { all, get, json, run, type Database, type Row, type SqlValue } from "../db/index.js";

function toRun(r: Row): Run {
  return {
    id: r.id as string,
    botId: r.bot_id as string,
    conversationId: (r.conversation_id as string | null) ?? null,
    trigger: { type: r.trigger_type as RunTrigger["type"], ref: (r.trigger_ref as string | null) ?? null },
    depth: Number(r.depth),
    chainId: (r.chain_id as string | null) ?? (r.id as string),
    status: r.status as RunStatus,
    input: r.input as string,
    skill: (r.skill as string | null) ?? null,
    steps: json<Step[]>(r.steps, []),
    reply: (r.reply as string | null) ?? null,
    usage: {
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cachedTokens: Number(r.cached_tokens),
      costUsd: Number(r.cost_usd),
      subscription: r.subscription === 1,
    },
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    startedAt: (r.started_at as string | null) ?? null,
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}

export class RunsRepo {
  constructor(private readonly db: Database) {}

  insert(r: Run): void {
    run(
      this.db,
      `INSERT INTO runs (id, bot_id, conversation_id, trigger_type, trigger_ref, depth, chain_id, input, skill, status, steps,
         created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      r.id,
      r.botId,
      r.conversationId,
      r.trigger.type,
      r.trigger.ref,
      r.depth,
      r.chainId,
      r.input,
      r.skill,
      r.status,
      r.createdAt,
    );
  }

  /** Every run of a chain, oldest first. */
  inChain(chainId: string): Run[] {
    return all(this.db, "SELECT * FROM runs WHERE chain_id = ? ORDER BY created_at", chainId).map(toRun);
  }

  get(id: string): Run | undefined {
    const row = get(this.db, "SELECT * FROM runs WHERE id = ?", id);
    return row ? toRun(row) : undefined;
  }

  list(filter: { botId?: string; conversationId?: string; status?: string; limit?: number } = {}): Run[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (filter.botId) {
      where.push("bot_id = ?");
      params.push(filter.botId);
    }
    if (filter.conversationId) {
      where.push("conversation_id = ?");
      params.push(filter.conversationId);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(Math.min(filter.limit ?? 100, 500));
    return all(this.db, `SELECT * FROM runs ${clause} ORDER BY created_at DESC LIMIT ?`, ...params).map(toRun);
  }

  setStatus(id: string, status: RunStatus, fields: { startedAt?: string; finishedAt?: string; error?: string | null; reply?: string | null } = {}): void {
    run(
      this.db,
      `UPDATE runs SET status = ?,
         started_at = COALESCE(?, started_at),
         finished_at = COALESCE(?, finished_at),
         error = CASE WHEN ? THEN ? ELSE error END,
         reply = CASE WHEN ? THEN ? ELSE reply END
       WHERE id = ?`,
      status,
      fields.startedAt ?? null,
      fields.finishedAt ?? null,
      fields.error !== undefined ? 1 : 0,
      fields.error ?? null,
      fields.reply !== undefined ? 1 : 0,
      fields.reply ?? null,
      id,
    );
  }

  setSteps(id: string, steps: Step[]): void {
    run(this.db, "UPDATE runs SET steps = ? WHERE id = ?", JSON.stringify(steps), id);
  }

  setUsage(id: string, u: Usage): void {
    run(
      this.db,
      "UPDATE runs SET input_tokens = ?, output_tokens = ?, cached_tokens = ?, cost_usd = ?, subscription = ? WHERE id = ?",
      u.inputTokens,
      u.outputTokens,
      u.cachedTokens,
      u.costUsd,
      u.subscription ? 1 : 0,
      id,
    );
  }

  /** Runs of a bot that are queued, running or waiting. */
  active(botId: string): Run[] {
    return all(
      this.db,
      "SELECT * FROM runs WHERE bot_id = ? AND status IN ('queued', 'running', 'waiting') ORDER BY created_at",
      botId,
    ).map(toRun);
  }

  /** The last finished run of a bot in a conversation, before `runId`. */
  lastFinished(botId: string, conversationId: string, excludeRunId: string): Run | undefined {
    const row = get(
      this.db,
      `SELECT * FROM runs WHERE bot_id = ? AND conversation_id = ? AND id != ? AND status = 'done'
       ORDER BY finished_at DESC LIMIT 1`,
      botId,
      conversationId,
      excludeRunId,
    );
    return row ? toRun(row) : undefined;
  }
}

export class BrainSessionsRepo {
  constructor(private readonly db: Database) {}

  get(botId: string, conversationId: string, kind: string): string | null {
    const row = get<{ session_id: string }>(
      this.db,
      "SELECT session_id FROM brain_sessions WHERE bot_id = ? AND conversation_id = ? AND kind = ?",
      botId,
      conversationId,
      kind,
    );
    return row?.session_id ?? null;
  }

  set(botId: string, conversationId: string, kind: string, sessionId: string): void {
    run(
      this.db,
      `INSERT INTO brain_sessions (bot_id, conversation_id, kind, session_id, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (bot_id, conversation_id, kind) DO UPDATE SET session_id = excluded.session_id,
         updated_at = excluded.updated_at`,
      botId,
      conversationId,
      kind,
      sessionId,
      new Date().toISOString(),
    );
  }

  clear(botId: string, conversationId: string, kind: string): void {
    run(
      this.db,
      "DELETE FROM brain_sessions WHERE bot_id = ? AND conversation_id = ? AND kind = ?",
      botId,
      conversationId,
      kind,
    );
  }
}
