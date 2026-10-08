// Routines (specs/routines): scheduled or webhook-triggered runs of one bot.
// The scheduler reads time from an injected clock so tests can drive it.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { Cron } from "croner";
import type { Bot, Routine, RoutineApproval, RoutineRun, RoutineTrigger, Run } from "@orbis/shared";
import type { HubContext } from "../context.js";
import type { Collaboration } from "../collab/handoff.js";
import type { DraftService } from "../approvals/drafts.js";
import { badRequest, conflict, HttpError, notFound, unauthorized } from "../errors.js";
import { newId } from "../ids.js";
import type { RunHooks } from "../runs/engine.js";
import type { BeforeToolCall } from "../tools/gateway.js";
import { TOOL_RESULT_CAP, untrusted, type ToolDefinition } from "../tools/registry.js";
import { IdParams } from "../api/schemas.js";
import { ROUTINES_PER_BOT, RoutinesRepo, type RoutineRow } from "./repo.js";

const clip = (text: string, n: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

const ACTIVITY_KEY = "user.lastActiveAt";
const DAY_MS = 86_400_000;
const WEBHOOK_BODY_LIMIT = 1024 * 1024;

export interface RoutineInput {
  name: string;
  trigger: RoutineTrigger;
  instruction: string;
  approval?: RoutineApproval;
}

/** Throws a 400 with the field that is wrong; returns the trigger with its timezone filled in. */
export function validateTrigger(trigger: RoutineTrigger): RoutineTrigger {
  if (trigger.type === "webhook") return { type: "webhook" };
  const timezone = trigger.timezone?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw badRequest("invalid routine", { "trigger.timezone": `"${timezone}" is not an IANA timezone` });
  }
  try {
    new Cron(trigger.cron, { timezone, paused: true }).stop();
  } catch (err) {
    throw badRequest("invalid routine", { "trigger.cron": `is not a cron schedule (${err instanceof Error ? err.message : String(err)})` });
  }
  return { type: "cron", cron: trigger.cron.trim(), timezone };
}

export function nextFire(trigger: RoutineTrigger, from: Date): Date | null {
  if (trigger.type !== "cron") return null;
  const job = new Cron(trigger.cron, { timezone: trigger.timezone, paused: true });
  const next = job.nextRun(from);
  job.stop();
  return next;
}

function describeTrigger(trigger: RoutineTrigger): string {
  return trigger.type === "cron" ? `cron "${trigger.cron}" in ${trigger.timezone}` : "webhook";
}

export class RoutineService {
  readonly repo: RoutinesRepo;
  /** Next fire time (epoch ms) of every enabled, unpaused cron routine. */
  private readonly next = new Map<string, number>();
  /** Routine runs in flight: their mode decides whether external tools act. */
  private readonly active = new Map<string, { routineId: string; name: string; mode: RoutineApproval }>();
  private timer: NodeJS.Timeout | null = null;
  /** Per routine: the still-running run a turn was last skipped for (one event per run). */
  private readonly skipped = new Map<string, string>();
  private lastActivityWrite = 0;

  constructor(
    private readonly hub: HubContext,
    private readonly drafts: DraftService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repo = new RoutinesRepo(hub.db);
    if (!this.repo.setting(ACTIVITY_KEY)) this.repo.setSetting(ACTIVITY_KEY, this.now().toISOString());
    for (const row of this.repo.listAll()) this.schedule(row);
    // A routine run whose run ended while no hub watched it (a restart closes those runs): record how it ended.
    for (const open of this.repo.openRuns()) {
      if (!open.runId) continue;
      const run = hub.repos.runs.get(open.runId);
      if (!run || ["done", "failed", "cancelled"].includes(run.status)) {
        this.repo.finishRun(open.runId, run?.status ?? "failed", run ? (run.status === "done" ? (run.reply ?? "").slice(0, 200) || null : run.error) : "the run is gone");
      }
    }
  }

  // --- reading -------------------------------------------------------------------

  private row(id: string): RoutineRow {
    const row = this.repo.get(id);
    if (!row) throw notFound(`routine ${id}`);
    return row;
  }

  view(row: RoutineRow, withSecret = false): Routine & { secret?: string } {
    const next = this.next.get(row.id);
    return {
      id: row.id,
      botId: row.botId,
      name: row.name,
      trigger: row.trigger,
      instruction: row.instruction,
      approval: row.approval,
      enabled: row.enabled,
      paused: row.paused,
      webhookPath: row.trigger.type === "webhook" ? `/hooks/routines/${row.id}` : null,
      nextRunAt: next !== undefined ? new Date(next).toISOString() : null,
      lastRun: this.repo.lastRun(row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(withSecret ? { secret: row.secret } : {}),
    };
  }

  list(botRef: string): Routine[] {
    return this.repo.listForBot(this.hub.botService.get(botRef).id).map((r) => this.view(r));
  }

  // --- cards ---------------------------------------------------------------------

  /**
   * A routine card in the bot's direct conversation (created, enabled, disabled, paused), and in `alsoIn`
   * too: the conversation where a manager made the routine for its report.
   */
  private card(row: RoutineRow, event: "created" | "enabled" | "disabled" | "paused", text: string, alsoIn?: string): void {
    const direct = this.hub.conversationService.directFor(row.botId).id;
    for (const conversationId of new Set([direct, ...(alsoIn ? [alsoIn] : [])])) {
      this.hub.timeline.post({
        conversationId,
        kind: "card",
        author: { type: "system", id: null },
        text,
        runId: null,
        card: { type: "routine", state: event, data: { routineId: row.id, botId: row.botId, name: row.name, trigger: row.trigger, approval: row.approval, event } },
      });
    }
  }

  /** Whether `bot` sits below `manager` in the team: it reports to it, directly or through others. */
  private below(bot: Bot, manager: Bot): boolean {
    const seen = new Set<string>();
    for (let up = bot.reportsTo; up && !seen.has(up); up = this.hub.repos.bots.get(up)?.reportsTo ?? null) {
      if (up === manager.id) return true;
      seen.add(up);
    }
    return false;
  }

  // --- writing -------------------------------------------------------------------

  create(botRef: string, input: RoutineInput, alsoIn?: string): Routine & { secret: string } {
    const bot = this.hub.botService.get(botRef);
    const name = input.name.trim();
    if (!name) throw badRequest("invalid routine", { name: "must not be empty" });
    if (!input.instruction.trim()) throw badRequest("invalid routine", { instruction: "must not be empty" });
    if (this.repo.countForBot(bot.id) >= ROUTINES_PER_BOT) {
      throw conflict("routine_limit", `@${bot.handle} already has ${ROUTINES_PER_BOT} routines, the most a bot can hold`);
    }
    const at = this.now().toISOString();
    const row: RoutineRow = {
      id: newId("rtn"),
      botId: bot.id,
      name,
      trigger: validateTrigger(input.trigger),
      instruction: input.instruction.trim(),
      approval: input.approval ?? "normal",
      enabled: false,
      paused: false,
      secret: randomBytes(24).toString("base64url"),
      createdAt: at,
      updatedAt: at,
    };
    this.repo.insert(row);
    this.card(row, "created", `Routine "${row.name}" of @${bot.handle} created (${describeTrigger(row.trigger)}). Test it, then enable it.`, alsoIn);
    return this.view(row, true) as Routine & { secret: string };
  }

  update(id: string, patch: Partial<RoutineInput>): Routine {
    const row = this.row(id);
    const next: Parameters<RoutinesRepo["update"]>[1] = {};
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw badRequest("invalid routine", { name: "must not be empty" });
      next.name = patch.name.trim();
    }
    if (patch.instruction !== undefined) {
      if (!patch.instruction.trim()) throw badRequest("invalid routine", { instruction: "must not be empty" });
      next.instruction = patch.instruction.trim();
    }
    if (patch.trigger !== undefined) next.trigger = validateTrigger(patch.trigger);
    if (patch.approval !== undefined) next.approval = patch.approval;
    this.repo.update(id, next, this.now().toISOString());
    const updated = this.row(id);
    this.schedule(updated);
    return this.view(updated);
  }

  delete(id: string): void {
    this.row(id);
    this.repo.delete(id);
    this.next.delete(id);
  }

  enable(id: string, force = false): Routine {
    const row = this.row(id);
    if (!force && !this.repo.hasSuccessfulTest(id)) {
      throw conflict("untested", `routine "${row.name}" has no successful test run; test it first, or enable with force`);
    }
    this.repo.update(id, { enabled: true, paused: false }, this.now().toISOString());
    const updated = this.row(id);
    this.schedule(updated);
    this.card(updated, "enabled", `Routine "${updated.name}" enabled (${describeTrigger(updated.trigger)}).`);
    return this.view(updated);
  }

  disable(id: string): Routine {
    this.row(id);
    this.repo.update(id, { enabled: false }, this.now().toISOString());
    const updated = this.row(id);
    this.schedule(updated);
    this.card(updated, "disabled", `Routine "${updated.name}" disabled.`);
    return this.view(updated);
  }

  // --- running -------------------------------------------------------------------

  /** Start a run of the routine's bot in its direct conversation and record it. */
  fire(row: RoutineRow, opts: { test?: boolean; via?: "routine" | "webhook"; payload?: string; event?: string | null } = {}): RoutineRun {
    const test = opts.test ?? false;
    const mode: RoutineApproval = test ? "draft_only" : row.approval;
    const conversation = this.hub.conversationService.directFor(row.botId);
    const parts = [`Routine "${row.name}" (${describeTrigger(row.trigger)}${test ? ", test run" : ""}). Do this now:`, row.instruction];
    if (mode === "draft_only") {
      parts.push("This run is draft-only: tools that act outside Orbis do not run; each call becomes a draft for the user to review.");
    }
    if (opts.payload !== undefined) {
      parts.push(`The webhook delivered this payload${opts.event ? ` (event: ${opts.event})` : ""}:`);
      parts.push(untrusted(`webhook:${row.name}`, opts.payload.length > TOOL_RESULT_CAP ? `${opts.payload.slice(0, TOOL_RESULT_CAP)}\n[… truncated]` : opts.payload));
    }
    const run = this.hub.engine.enqueue({
      botId: row.botId,
      conversationId: conversation.id,
      trigger: { type: opts.via === "webhook" ? "webhook" : "routine", ref: row.id },
      input: parts.join("\n\n"),
      includeHistory: false,
    });
    this.active.set(run.id, { routineId: row.id, name: row.name, mode });
    const record: RoutineRun = { id: newId("rrn"), routineId: row.id, runId: run.id, test, status: run.status, summary: null, startedAt: this.now().toISOString() };
    this.repo.insertRun(record);
    return record;
  }

  test(id: string): RoutineRun {
    return this.fire(this.row(id), { test: true });
  }

  /** Recompute a routine's next fire time from the clock. */
  private schedule(row: RoutineRow): void {
    this.next.delete(row.id);
    if (!row.enabled || row.paused || row.trigger.type !== "cron") return;
    const at = nextFire(row.trigger, this.now());
    if (at) this.next.set(row.id, at.getTime());
  }

  /** Fire every routine that is due at `now`; pause scheduled routines after a long absence. */
  tick(now: Date = this.now()): string[] {
    this.checkAbsence(now);
    const fired: string[] = [];
    for (const [id, at] of [...this.next]) {
      if (at > now.getTime()) continue;
      const row = this.repo.get(id);
      if (!row || !row.enabled || row.paused || row.trigger.type !== "cron") {
        this.next.delete(id);
        continue;
      }
      // One run at a time: a schedule faster than the bot's work does not pile runs up.
      const last = this.repo.lastRun(id);
      const busy = last && !last.test && last.runId ? this.hub.repos.runs.get(last.runId) : undefined;
      if (busy && ["queued", "running", "waiting"].includes(busy.status)) {
        if (this.skipped.get(id) !== busy.id) {
          this.skipped.set(id, busy.id);
          const conversation = this.hub.conversationService.directFor(row.botId);
          this.hub.timeline.event(conversation.id, "routine.skipped", `Routine "${row.name}" skipped its turn: its previous run is still going.`, { routineId: id, runId: busy.id });
        }
      } else {
        this.fire(row);
        fired.push(id);
      }
      const after = nextFire(row.trigger, new Date(Math.max(now.getTime(), at) + 1000));
      if (after) this.next.set(id, after.getTime());
      else this.next.delete(id);
    }
    return fired;
  }

  /** Schedule every routine again (an import added some). */
  reload(): void {
    for (const row of this.repo.listAll()) this.schedule(row);
  }

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error("routine scheduler tick failed:", err);
      }
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- absence -------------------------------------------------------------------

  /** The user did something (any authenticated change through the API). */
  recordActivity(): void {
    const now = this.now();
    if (now.getTime() - this.lastActivityWrite < 60_000) return;
    this.lastActivityWrite = now.getTime();
    this.repo.setSetting(ACTIVITY_KEY, now.toISOString());
  }

  checkAbsence(now: Date = this.now()): string[] {
    const last = Date.parse(this.repo.setting(ACTIVITY_KEY) ?? now.toISOString());
    const days = this.hub.config.absencePauseDays;
    if (now.getTime() - last <= days * DAY_MS) return [];
    const paused: string[] = [];
    for (const row of this.repo.listAll()) {
      if (!row.enabled || row.paused || row.trigger.type !== "cron") continue;
      this.repo.update(row.id, { paused: true }, now.toISOString());
      this.next.delete(row.id);
      this.card({ ...row, paused: true }, "paused", `Routine "${row.name}" paused: no activity from you for ${days} days (ORBIS_ABSENCE_PAUSE_DAYS). Enable it again to resume.`);
      paused.push(row.id);
    }
    return paused;
  }

  // --- hooks ----------------------------------------------------------------------

  hooks(): RunHooks {
    return {
      onEnded: (run: Run) => {
        if (!this.active.delete(run.id)) return;
        const summary = run.status === "done" ? (run.reply ?? "").slice(0, 200) : (run.error ?? run.status);
        this.repo.finishRun(run.id, run.status, summary || null);
      },
    };
  }

  /** In a draft-only routine run, an external tool becomes a draft card instead of acting. */
  draftOnlyHook(): BeforeToolCall {
    return async ({ run, bot }, tool, input) => {
      const routine = this.active.get(run.id);
      if (!routine || routine.mode !== "draft_only" || tool.risk !== "external") return;
      const item = this.drafts.create(run, bot, {
        channel: "chat",
        to: tool.name,
        subject: `Held by the draft-only routine "${routine.name}"`,
        body: `The routine wanted to call ${tool.name} with:\n${JSON.stringify(input ?? {}, null, 2)}`,
      });
      return {
        output: `draft-only routine: ${tool.name} did not run; the call is draft ${item.id} for the user to review. Continue as if it had not happened, and report what you would have done.`,
        isError: false,
      };
    };
  }

  // --- tools ----------------------------------------------------------------------

  tools(): ToolDefinition[] {
    return [
      {
        name: "routine.create",
        description:
          "Create an Orbis routine: an instruction run on a cron schedule (with an IANA timezone) or when a signed webhook arrives, for yourself or, with bot, for one of your reports. " +
          "This is the only way to schedule work: the user sees, tests and stops routines in Orbis, so never use another scheduler, cron or remote trigger. It starts disabled; the user tests and enables it.",
        input: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          instruction: Type.String({ minLength: 1, maxLength: 20_000 }),
          cron: Type.Optional(Type.String({ description: 'five-field cron, e.g. "0 9 * * 1-5"' })),
          timezone: Type.Optional(Type.String({ description: "IANA timezone, e.g. America/Sao_Paulo (default UTC)" })),
          webhook: Type.Optional(Type.Boolean({ description: "trigger on a signed webhook instead of a schedule" })),
          approval: Type.Optional(Type.Union([Type.Literal("normal"), Type.Literal("draft_only")])),
          bot: Type.Optional(
            Type.String({ maxLength: 40, description: "the handle of a bot that reports to you (directly or through others), to create the routine for it; default: yourself" }),
          ),
        }),
        risk: "write",
        defaultDecision: "ask",
        handler: async (
          input: { name: string; instruction: string; cron?: string; timezone?: string; webhook?: boolean; approval?: RoutineApproval; bot?: string },
          ctx,
        ) => {
          if (!input.webhook && !input.cron) return { output: "give a cron schedule, or webhook: true", isError: true };
          const ref = input.bot?.replace(/^@/, "").trim().toLowerCase();
          const owner = ref ? this.hub.repos.bots.get(ref) : ctx.bot;
          if (!owner) return { output: `no bot @${ref}`, isError: true };
          if (owner.id !== ctx.bot.id && !this.below(owner, ctx.bot)) {
            return { output: `@${owner.handle} does not report to you: you create routines for yourself and for your reports only`, isError: true };
          }
          try {
            const trigger: RoutineTrigger = input.webhook ? { type: "webhook" } : { type: "cron", cron: input.cron!, timezone: input.timezone ?? "UTC" };
            const shownIn = owner.id === ctx.bot.id ? undefined : (ctx.run.conversationId ?? undefined);
            const routine = this.create(owner.id, { name: input.name, instruction: input.instruction, trigger, approval: input.approval }, shownIn);
            const whose = owner.id === ctx.bot.id ? "" : ` for @${owner.handle}`;
            return `created routine ${routine.id} "${routine.name}"${whose} (${describeTrigger(routine.trigger)}), disabled: the user tests it and enables it in Orbis (${owner.name}'s Routines)`;
          } catch (err) {
            if (err instanceof HttpError) return { output: `${err.message}${err.fields ? `: ${JSON.stringify(err.fields)}` : ""}`, isError: true };
            throw err;
          }
        },
      },
      {
        name: "routine.list",
        description:
          'List your routines with their trigger, state and last run. With bot set to a handle, list that bot\'s enabled routines; with "all", every bot\'s: you can call them with routine.call.',
        input: Type.Object({
          bot: Type.Optional(Type.String({ maxLength: 40, description: 'a bot\'s handle, or "all"; default: your own routines' })),
        }),
        risk: "read",
        handler: async (input: { bot?: string }, ctx) => {
          const ref = input.bot?.replace(/^@/, "").trim();
          if (ref) {
            const owners = ref === "all" ? this.hub.repos.bots.list({ includeHidden: true }) : [this.hub.repos.bots.get(ref)].filter((b): b is Bot => b !== undefined);
            if (owners.length === 0) return { output: `no bot @${ref}`, isError: true };
            const lines = owners.flatMap((owner) =>
              this.repo
                .listForBot(owner.id)
                .filter((r) => r.enabled)
                .map((r) => `@${owner.handle}/${r.name} (${r.id}): ${describeTrigger(r.trigger)}${r.approval === "draft_only" ? ", draft-only" : ""} — ${clip(r.instruction, 160)}`),
            );
            return lines.length ? lines.join("\n") : ref === "all" ? "no bot has an enabled routine" : `@${ref} has no enabled routine`;
          }
          const routines = this.list(ctx.bot.id);
          if (routines.length === 0) return "you have no routines";
          return routines
            .map((r) => `${r.id} "${r.name}": ${describeTrigger(r.trigger)}, ${r.enabled ? (r.paused ? "paused" : "enabled") : "disabled"}${r.lastRun ? `, last run ${r.lastRun.status} at ${r.lastRun.startedAt}` : ""}`)
            .join("\n");
        },
      },
    ];
  }

  /**
   * `routine.call` (specs/routines, specs/squads): run another bot's enabled routine now, as a handoff to
   * that bot in this conversation — its answer comes back like a handoff's, its draft-only mode holds, and
   * the routine's runs say who called it.
   */
  callTool(collaboration: Pick<Collaboration, "delegate">): ToolDefinition {
    return {
      name: "routine.call",
      description:
        'Call another bot\'s enabled routine now: it runs its routine\'s instruction (with your note) in this conversation, and you get its answer back like a handoff\'s. Name it as "@handle/routine name" or by its id; routine.list with bot "all" lists them.',
      input: Type.Object({
        routine: Type.String({ minLength: 2, maxLength: 200, description: 'e.g. "@lia/weekly report", or a routine id' }),
        note: Type.Optional(Type.String({ maxLength: 20_000, description: "what you need from this run, added to the routine's instruction" })),
        returnResult: Type.Optional(Type.Boolean({ description: "default true: get the answer back with the rest of this turn's handoffs" })),
      }),
      risk: "write",
      handler: async (input: { routine: string; note?: string; returnResult?: boolean }, ctx) => {
        const row = this.findCalled(input.routine);
        if (typeof row === "string") return { output: row, isError: true };
        const owner = this.hub.repos.bots.get(row.botId);
        if (!owner) return { output: "the routine's bot is gone", isError: true };
        if (owner.id === ctx.bot.id) return { output: `"${row.name}" is your own routine: do its instruction yourself`, isError: true };
        if (!row.enabled) return { output: `the routine "${row.name}" of @${owner.handle} is disabled: only enabled (tested) routines can be called`, isError: true };
        const parts = [`@${ctx.bot.handle} called your routine "${row.name}". Do this now:`, row.instruction];
        if (input.note) parts.push(`What @${ctx.bot.handle} needs from this run:`, input.note);
        if (row.approval === "draft_only") parts.push("This run is draft-only: tools that act outside Orbis do not run; each call becomes a draft for the user to review.");
        parts.push(`Answer with the result; @${ctx.bot.handle} gets your answer.`);
        const handed = collaboration.delegate(ctx, owner, {
          task: `routine "${row.name}"${input.note ? `: ${clip(input.note, 200)}` : ""}`,
          context: input.note ?? null,
          input: parts.join("\n\n"),
          returnResult: input.returnResult ?? true,
        });
        if (typeof handed === "string") return { output: handed, isError: true };
        this.active.set(handed.run.id, { routineId: row.id, name: row.name, mode: row.approval });
        this.repo.insertRun({
          id: newId("rrn"),
          routineId: row.id,
          runId: handed.run.id,
          test: false,
          status: handed.run.status,
          summary: null,
          startedAt: this.now().toISOString(),
          calledBy: ctx.bot.id,
        });
        return `Called the routine "${row.name}" of @${owner.handle} (handoff ${handed.card.id}); it runs in this conversation${
          handed.returnResult ? " and you get its answer back, with the rest of this turn's handoffs, as a new task" : ""
        }. Do not wait for it.`;
      },
    };
  }

  /** A routine by id, or as "@handle/name" (any case). */
  private findCalled(ref: string): RoutineRow | string {
    const byId = this.repo.get(ref.trim());
    if (byId) return byId;
    const m = /^@?([a-z0-9-]+)\/(.+)$/i.exec(ref.trim());
    if (!m) return `no routine ${ref}: name it as "@handle/routine name" or by its id`;
    const owner = this.hub.repos.bots.get(m[1]!.toLowerCase());
    if (!owner) return `no bot @${m[1]}`;
    const name = m[2]!.trim().toLowerCase();
    const row = this.repo.listForBot(owner.id).find((r) => r.name.toLowerCase() === name);
    return row ?? `@${owner.handle} has no routine "${m[2]!.trim()}"; routine.list with bot "${owner.handle}" lists its routines`;
  }

  // --- REST -----------------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Trigger = Type.Union([
      Type.Object({ type: Type.Literal("cron"), cron: Type.String({ minLength: 1, maxLength: 200 }), timezone: Type.Optional(Type.String({ maxLength: 100 })) }, { additionalProperties: false }),
      Type.Object({ type: Type.Literal("webhook") }, { additionalProperties: false }),
    ]);
    const Approval = Type.Union([Type.Literal("normal"), Type.Literal("draft_only")]);
    const Body = Type.Object(
      { name: Type.String({ minLength: 1, maxLength: 120 }), trigger: Trigger, instruction: Type.String({ minLength: 1, maxLength: 20_000 }), approval: Type.Optional(Approval) },
      { additionalProperties: false },
    );
    const Patch = Type.Object(
      {
        name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
        trigger: Type.Optional(Trigger),
        instruction: Type.Optional(Type.String({ minLength: 1, maxLength: 20_000 })),
        approval: Type.Optional(Approval),
      },
      { additionalProperties: false },
    );
    const schema = (extra: object = {}) => ({ tags: ["routines"], params: IdParams, ...extra });

    app.get("/api/v1/bots/:id/routines", { schema: schema() }, async (req) => this.list(req.params.id));
    app.post("/api/v1/bots/:id/routines", { schema: schema({ body: Body }) }, async (req, reply) => {
      reply.code(201);
      return this.create(req.params.id, req.body as RoutineInput);
    });
    app.get("/api/v1/routines/:id", { schema: schema() }, async (req) => this.view(this.row(req.params.id), true));
    app.patch("/api/v1/routines/:id", { schema: schema({ body: Patch }) }, async (req) => this.update(req.params.id, req.body as Partial<RoutineInput>));
    app.delete("/api/v1/routines/:id", { schema: schema() }, async (req, reply) => {
      this.delete(req.params.id);
      reply.code(204);
      return null;
    });
    app.post("/api/v1/routines/:id/test", { schema: schema() }, async (req, reply) => {
      reply.code(202);
      return this.test(req.params.id);
    });
    // The body is optional here (`{ force: true }` or nothing), so it is checked by hand.
    app.post("/api/v1/routines/:id/enable", { schema: schema() }, async (req) => {
      const force = (req.body as { force?: unknown } | undefined | null)?.force;
      if (force !== undefined && typeof force !== "boolean") throw badRequest("invalid request", { force: "must be a boolean" });
      return this.enable(req.params.id, force === true);
    });
    app.post("/api/v1/routines/:id/disable", { schema: schema() }, async (req) => this.disable(req.params.id));
    app.get("/api/v1/routines/:id/runs", { schema: schema() }, async (req) => {
      this.row(req.params.id);
      return this.repo.runs(req.params.id);
    });

    // Webhooks: the raw body is what the signature covers, so this scope keeps it as bytes.
    await root.register(async (hooks) => {
      hooks.removeAllContentTypeParsers();
      hooks.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: WEBHOOK_BODY_LIMIT }, (_req, body, done) => done(null, body));
      hooks.post("/hooks/routines/:id", { schema: { hide: true } }, async (req, reply) => {
        const row = this.repo.get((req.params as { id: string }).id);
        if (!row || !row.enabled || row.trigger.type !== "webhook") throw notFound("routine");
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!verifySignature(row.secret, raw, req.headers["x-orbis-signature"] ?? req.headers["x-hub-signature-256"])) throw unauthorized();
        const event = req.headers["x-github-event"];
        const record = this.fire(row, { via: "webhook", payload: raw.toString("utf8"), event: typeof event === "string" ? event : null });
        reply.code(202);
        return { runId: record.runId };
      });
    });
  }
}

/** `sha256=<hex>` of HMAC-SHA256(raw body, secret), compared in constant time. */
export function verifySignature(secret: string, raw: Buffer, header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(value?.trim() ?? "");
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(Buffer.from(m[1]!, "hex"), expected);
}

export function sign(secret: string, raw: string | Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}
