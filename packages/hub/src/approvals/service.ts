// Approvals: pause a run on `ask`, show a card, wait for the user (specs/approvals).
import type { Approval, ApprovalDecision, Bot, PolicyDecision, Run } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import { conflict, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import type { ApprovalsRepo } from "../repos/approvals.js";
import type { RunEngine } from "../runs/engine.js";
import type { BotService } from "../services/bots.js";
import type { Timeline } from "../services/timeline.js";
import { decide } from "./policy.js";

export interface GateRequest {
  run: Run;
  bot: Bot;
  tool: string;
  defaultDecision: Exclude<PolicyDecision, "deny">;
  input: unknown;
  reason?: string | null;
  signal: AbortSignal;
}

export type GateResult = { allowed: true } | { allowed: false; message: string };

interface Waiter {
  resolve(decision: { decision: ApprovalDecision; note: string | null }): void;
}

export interface ApprovalServiceDeps {
  repo: ApprovalsRepo;
  bus: EventBus;
  timeline: Timeline;
  engine: RunEngine;
  botService: BotService;
  /** Mask secret values in what the card shows (the secrets capability plugs in here). */
  mask?: (botId: string, value: unknown) => unknown;
}

export class ApprovalService {
  private readonly waiters = new Map<string, Waiter>();

  constructor(private readonly d: ApprovalServiceDeps) {}

  setMask(mask: (botId: string, value: unknown) => unknown): void {
    this.d.mask = mask;
  }

  list(status?: Approval["status"]): Approval[] {
    return this.d.repo.list(status);
  }

  get(id: string): Approval {
    const approval = this.d.repo.get(id);
    if (!approval) throw notFound(`approval ${id}`);
    return approval;
  }

  /** Decide a tool call; on `ask`, wait for the user's answer or the end of the run. */
  async gate(req: GateRequest): Promise<GateResult> {
    // Read the policy fresh: an "allow always" given a moment ago must count.
    const bot = this.d.botService.get(req.bot.id);
    const verdict = decide(bot.policy, req.tool, req.defaultDecision);
    if (verdict.decision === "allow") return { allowed: true };
    if (verdict.decision === "deny") {
      const why = verdict.rule ? ` (rule ${verdict.rule.tool}: deny${verdict.rule.locked ? ", locked" : ""})` : "";
      return { allowed: false, message: `${req.tool} is denied by this bot's policy${why}.` };
    }
    if (req.signal.aborted) return { allowed: false, message: "the run ended before the approval" };

    const masked = this.d.mask ? this.d.mask(bot.id, req.input) : req.input;
    const approval: Approval = {
      id: newId("apr"),
      runId: req.run.id,
      botId: bot.id,
      conversationId: req.run.conversationId,
      itemId: null,
      tool: req.tool,
      input: masked,
      reason: req.reason ?? null,
      status: "pending",
      decision: null,
      note: null,
      createdAt: nowIso(),
      decidedAt: null,
    };
    this.d.repo.insert(approval);
    if (approval.conversationId) {
      const item = this.d.timeline.post({
        conversationId: approval.conversationId,
        kind: "card",
        author: { type: "bot", id: bot.id },
        text: `${bot.name} asks to use ${req.tool}`,
        runId: req.run.id,
        card: {
          type: "approval",
          state: "pending",
          data: { approvalId: approval.id, botId: bot.id, tool: req.tool, input: masked, reason: approval.reason, locked: verdict.source === "locked-ask" },
        },
      });
      this.d.repo.setItem(approval.id, item.id);
      approval.itemId = item.id;
    }
    this.d.engine.markWaiting(req.run.id, true);
    this.d.bus.publish("approval.requested", { approval: this.get(approval.id) });

    const answer = await new Promise<{ decision: ApprovalDecision; note: string | null } | null>((resolve) => {
      const onAbort = () => {
        this.waiters.delete(approval.id);
        resolve(null);
      };
      this.waiters.set(approval.id, {
        resolve: (value) => {
          req.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
      });
      req.signal.addEventListener("abort", onAbort, { once: true });
    });

    if (answer === null) {
      this.expire(approval.id);
      return { allowed: false, message: "the run ended before the user answered" };
    }
    this.d.engine.markWaiting(req.run.id, false);
    if (answer.decision === "deny") {
      return { allowed: false, message: `The user denied ${req.tool}.${answer.note ? ` Note from the user: ${answer.note}` : ""}` };
    }
    return { allowed: true };
  }

  /** The user's answer: allow once, allow always (stores a grant) or deny. */
  resolve(id: string, decision: ApprovalDecision, note: string | null = null): Approval {
    const approval = this.get(id);
    if (approval.status !== "pending") throw conflict("approval_closed", `approval ${id} is already ${approval.status}`);
    const status = decision === "deny" ? "denied" : "approved";
    const at = nowIso();
    this.d.repo.decide(id, status, decision, note, at);
    if (decision === "allow_always") {
      const bot = this.d.botService.get(approval.botId);
      if (!bot.policy.grants.includes(approval.tool)) {
        this.d.botService.update(bot.id, { policy: { ...bot.policy, grants: [...bot.policy.grants, approval.tool] } });
      }
    }
    this.updateCard(approval, status, { decision, note });
    const updated = this.get(id);
    this.d.bus.publish("approval.resolved", { approval: updated });
    const waiter = this.waiters.get(id);
    this.waiters.delete(id);
    waiter?.resolve({ decision, note });
    return updated;
  }

  /** Expire every pending approval of a run that ended. */
  expireForRun(runId: string): void {
    for (const approval of this.d.repo.pendingForRun(runId)) this.expire(approval.id);
  }

  /** At start: approvals left pending by a previous process can never be answered. */
  expireStale(): void {
    for (const approval of this.d.repo.expireAllPending(nowIso())) this.updateCard(approval, "expired", {});
  }

  private expire(id: string): void {
    const approval = this.d.repo.get(id);
    if (!approval || approval.status !== "pending") return;
    this.d.repo.decide(id, "expired", null, null, nowIso());
    this.waiters.delete(id);
    this.updateCard(approval, "expired", {});
    this.d.bus.publish("approval.resolved", { approval: this.get(id) });
  }

  private updateCard(approval: Approval, state: string, extra: Record<string, unknown>): void {
    if (!approval.itemId) return;
    this.d.timeline.setCard(approval.itemId, {
      type: "approval",
      state,
      data: { approvalId: approval.id, botId: approval.botId, tool: approval.tool, input: approval.input, reason: approval.reason, ...extra },
    });
  }
}
