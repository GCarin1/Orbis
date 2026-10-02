// Routines and their runs (migration 1 tables `routines` and `routine_runs`).
import type { RoutineApproval, RoutineRun, RoutineTrigger } from "@orbis/shared";
import { all, get, json, run, type Database, type Row } from "../db/index.js";

/** Contract budgets: routines-per-bot and routine-runs-kept. */
export const ROUTINES_PER_BOT = 50;
export const ROUTINE_RUNS_KEPT = 20;

export interface RoutineRow {
  id: string;
  botId: string;
  name: string;
  trigger: RoutineTrigger;
  instruction: string;
  approval: RoutineApproval;
  enabled: boolean;
  paused: boolean;
  secret: string;
  createdAt: string;
  updatedAt: string;
}

function toRoutine(r: Row): RoutineRow {
  return {
    id: r.id as string,
    botId: r.bot_id as string,
    name: r.name as string,
    trigger: json<RoutineTrigger>(r.trigger, { type: "webhook" }),
    instruction: r.instruction as string,
    approval: (r.approval as RoutineApproval) ?? "normal",
    enabled: Boolean(r.enabled),
    paused: Boolean(r.paused),
    secret: r.secret as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toRun(r: Row): RoutineRun {
  return {
    id: r.id as string,
    routineId: r.routine_id as string,
    runId: (r.run_id as string | null) ?? null,
    test: Boolean(r.test),
    status: r.status as string,
    summary: (r.summary as string | null) ?? null,
    startedAt: r.started_at as string,
  };
}

export class RoutinesRepo {
  constructor(private readonly db: Database) {}

  insert(r: RoutineRow): void {
    run(
      this.db,
      `INSERT INTO routines (id, bot_id, name, trigger, instruction, approval, enabled, paused, secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.id,
      r.botId,
      r.name,
      JSON.stringify(r.trigger),
      r.instruction,
      r.approval,
      r.enabled ? 1 : 0,
      r.paused ? 1 : 0,
      r.secret,
      r.createdAt,
      r.updatedAt,
    );
  }

  update(id: string, patch: Partial<Pick<RoutineRow, "name" | "trigger" | "instruction" | "approval" | "enabled" | "paused">>, at: string): void {
    const sets: string[] = [];
    const values: Array<string | number> = [];
    if (patch.name !== undefined) sets.push("name = ?"), values.push(patch.name);
    if (patch.trigger !== undefined) sets.push("trigger = ?"), values.push(JSON.stringify(patch.trigger));
    if (patch.instruction !== undefined) sets.push("instruction = ?"), values.push(patch.instruction);
    if (patch.approval !== undefined) sets.push("approval = ?"), values.push(patch.approval);
    if (patch.enabled !== undefined) sets.push("enabled = ?"), values.push(patch.enabled ? 1 : 0);
    if (patch.paused !== undefined) sets.push("paused = ?"), values.push(patch.paused ? 1 : 0);
    if (sets.length === 0) return;
    run(this.db, `UPDATE routines SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, at, id);
  }

  get(id: string): RoutineRow | undefined {
    const row = get(this.db, "SELECT * FROM routines WHERE id = ?", id);
    return row ? toRoutine(row) : undefined;
  }

  listForBot(botId: string): RoutineRow[] {
    return all(this.db, "SELECT * FROM routines WHERE bot_id = ? ORDER BY created_at, id", botId).map(toRoutine);
  }

  listAll(): RoutineRow[] {
    return all(this.db, "SELECT * FROM routines ORDER BY created_at, id").map(toRoutine);
  }

  countForBot(botId: string): number {
    return Number(get(this.db, "SELECT COUNT(*) AS n FROM routines WHERE bot_id = ?", botId)?.n ?? 0);
  }

  delete(id: string): void {
    run(this.db, "DELETE FROM routines WHERE id = ?", id);
  }

  // --- runs ---------------------------------------------------------------------

  /** Record a run and keep only the newest ROUTINE_RUNS_KEPT of the routine. */
  insertRun(r: RoutineRun): void {
    run(
      this.db,
      "INSERT INTO routine_runs (id, routine_id, run_id, test, status, summary, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      r.id,
      r.routineId,
      r.runId,
      r.test ? 1 : 0,
      r.status,
      r.summary,
      r.startedAt,
    );
    run(
      this.db,
      `DELETE FROM routine_runs WHERE routine_id = ? AND id NOT IN
         (SELECT id FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?)`,
      r.routineId,
      r.routineId,
      ROUTINE_RUNS_KEPT,
    );
  }

  finishRun(runId: string, status: string, summary: string | null): RoutineRun | undefined {
    run(this.db, "UPDATE routine_runs SET status = ?, summary = ? WHERE run_id = ?", status, summary, runId);
    const row = get(this.db, "SELECT * FROM routine_runs WHERE run_id = ?", runId);
    return row ? toRun(row) : undefined;
  }

  /** Routine runs not recorded as ended (their run may have ended while the hub was down). */
  openRuns(): RoutineRun[] {
    return all(this.db, "SELECT * FROM routine_runs WHERE status NOT IN ('done', 'failed', 'cancelled')").map(toRun);
  }

  runs(routineId: string): RoutineRun[] {
    return all(this.db, "SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC", routineId).map(toRun);
  }

  lastRun(routineId: string): RoutineRun | null {
    const row = get(this.db, "SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1", routineId);
    return row ? toRun(row) : null;
  }

  hasSuccessfulTest(routineId: string): boolean {
    return Boolean(get(this.db, "SELECT 1 AS ok FROM routine_runs WHERE routine_id = ? AND test = 1 AND status = 'done' LIMIT 1", routineId));
  }

  // --- settings -----------------------------------------------------------------

  setting(key: string): string | null {
    return (get(this.db, "SELECT value FROM settings WHERE key = ?", key)?.value as string | undefined) ?? null;
  }

  setSetting(key: string, value: string): void {
    run(this.db, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }
}
