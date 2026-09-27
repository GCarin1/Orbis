import type { Approval, ApprovalDecision, ApprovalStatus } from "@orbis/shared";
import { all, get, json, run, type Database, type Row } from "../db/index.js";

function toApproval(r: Row): Approval {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    botId: r.bot_id as string,
    conversationId: (r.conversation_id as string | null) ?? null,
    itemId: (r.item_id as string | null) ?? null,
    tool: r.tool as string,
    input: json<unknown>(r.input, {}),
    reason: (r.reason as string | null) ?? null,
    status: r.status as ApprovalStatus,
    decision: (r.decision as ApprovalDecision | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
    decidedAt: (r.decided_at as string | null) ?? null,
  };
}

export class ApprovalsRepo {
  constructor(private readonly db: Database) {}

  insert(a: Approval): void {
    run(
      this.db,
      `INSERT INTO approvals (id, run_id, bot_id, conversation_id, item_id, tool, input, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      a.runId,
      a.botId,
      a.conversationId,
      a.itemId,
      a.tool,
      JSON.stringify(a.input ?? {}),
      a.reason,
      a.status,
      a.createdAt,
    );
  }

  setItem(id: string, itemId: string): void {
    run(this.db, "UPDATE approvals SET item_id = ? WHERE id = ?", itemId, id);
  }

  get(id: string): Approval | undefined {
    const row = get(this.db, "SELECT * FROM approvals WHERE id = ?", id);
    return row ? toApproval(row) : undefined;
  }

  list(status?: ApprovalStatus): Approval[] {
    const rows = status
      ? all(this.db, "SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT 500", status)
      : all(this.db, "SELECT * FROM approvals ORDER BY created_at DESC LIMIT 500");
    return rows.map(toApproval);
  }

  pendingForRun(runId: string): Approval[] {
    return all(this.db, "SELECT * FROM approvals WHERE run_id = ? AND status = 'pending'", runId).map(toApproval);
  }

  decide(id: string, status: ApprovalStatus, decision: ApprovalDecision | null, note: string | null, at: string): void {
    run(
      this.db,
      "UPDATE approvals SET status = ?, decision = ?, note = ?, decided_at = ? WHERE id = ?",
      status,
      decision,
      note,
      at,
      id,
    );
  }

  /** Pending approvals whose run cannot resume (the hub restarted). */
  expireAllPending(at: string): Approval[] {
    const pending = all(this.db, "SELECT * FROM approvals WHERE status = 'pending'").map(toApproval);
    run(this.db, "UPDATE approvals SET status = 'expired', decided_at = ? WHERE status = 'pending'", at);
    return pending;
  }
}
