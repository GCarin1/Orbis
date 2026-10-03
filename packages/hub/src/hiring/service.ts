// Hiring (specs/hiring, ADR 0015): a recruiter bot's brain writes short résumés for a project or one of the
// user's groups, many at once and cheaply; the user hires one, and only then does the brain write its full
// profile (instructions, responsibilities, needs, tools, skills, a first message), which becomes a bot.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, Candidate, CandidateStatus, HiringBasis, HiringRound, HiringRoundStatus, HiringTool, Run, Usage } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, json, run, type Row } from "../db/index.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import { askBrain, type AskResult } from "../brains/ask.js";
import { catalogEntry } from "../mcp/catalog.js";
import type { McpConnections } from "../mcp/connections.js";
import type { Vault } from "../secrets/vault.js";
import type { SkillStore } from "../skills/store.js";
import type { UsageService } from "../usage/service.js";
import { IdParams } from "../api/schemas.js";
import {
  allowlistFor,
  candidatesTask,
  ORBIS_TOOLS,
  parseCandidates,
  parsePersona,
  personaTask,
  RECRUITER_IDENTITY,
  skillDocument,
  type CandidateDraft,
  type Lang,
  type Persona,
  type WorkContext,
} from "./prompt.js";

/** The most résumés one generation asks for. */
export const MAX_CANDIDATES = 30;
/** A recruiter's answer may take a while: a CLI brain starts, thinks and writes many lines. */
const ASK_TIMEOUT_MS = 5 * 60_000;

export interface HiringDeps {
  skills: SkillStore;
  vault: Vault;
  mcp: McpConnections;
  usage: UsageService;
}

export interface HireOptions {
  /** The bot whose brain (and its key) the hired bot gets; the recruiter by default. */
  brainFrom?: string;
  /** The hired bot's manager; by default a team round's group lead, else none. */
  reportsTo?: string | null;
  /** A team round's hire joins its group unless this is false. */
  joinGroup?: boolean;
  lang?: Lang;
}

const toCandidate = (r: Row): Candidate => ({
  id: r.id as string,
  roundId: r.round_id as string,
  name: r.name as string,
  role: r.role as string,
  headline: r.headline as string,
  strengths: json<string[]>(r.strengths, []),
  tools: json<string[]>(r.tools, []),
  status: r.status as CandidateStatus,
  error: (r.error as string | null) ?? null,
  botId: (r.bot_id as string | null) ?? null,
  createdAt: r.created_at as string,
});

const usd = (n: number) => Math.round(n * 1e6) / 1e6;

export class HiringService {
  /** Work in progress, by round or candidate id: tests and shutdown wait on it. */
  private readonly working = new Map<string, Promise<void>>();

  constructor(
    private readonly hub: HubContext,
    private readonly deps: HiringDeps,
  ) {}

  // --- reading ---------------------------------------------------------------

  private toRound(r: Row): HiringRound {
    return {
      id: r.id as string,
      basis: r.basis as HiringBasis,
      brief: r.brief as string,
      groupId: (r.group_id as string | null) ?? null,
      recruiterId: (r.recruiter_id as string | null) ?? null,
      requested: Number(r.requested),
      status: r.status as HiringRoundStatus,
      error: (r.error as string | null) ?? null,
      usage: { inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), costUsd: usd(Number(r.cost_usd)) },
      candidates: all(this.hub.db, "SELECT * FROM hiring_candidates WHERE round_id = ? ORDER BY position", r.id as string).map(toCandidate),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  rounds(): HiringRound[] {
    return all(this.hub.db, "SELECT * FROM hiring_rounds ORDER BY created_at DESC, rowid DESC").map((r) => this.toRound(r));
  }

  round(id: string): HiringRound {
    const row = get(this.hub.db, "SELECT * FROM hiring_rounds WHERE id = ?", id);
    if (!row) throw notFound(`hiring round ${id}`);
    return this.toRound(row);
  }

  private candidate(id: string): Candidate {
    const row = get(this.hub.db, "SELECT * FROM hiring_candidates WHERE id = ?", id);
    if (!row) throw notFound(`candidate ${id}`);
    return toCandidate(row);
  }

  /** The tools a candidate may take: Orbis's computer, browser and web, and every connected MCP server. */
  tools(): HiringTool[] {
    const servers = this.deps.mcp
      .list()
      .filter((s) => s.status === "connected")
      .map((s): HiringTool => {
        const entry = s.catalogId ? catalogEntry(s.catalogId) : undefined;
        const description = entry?.description.en ?? (s.tools.map((t) => t.remoteName).join(", ") || "an MCP server");
        return { id: `mcp.${s.id}`, name: s.name, description, logo: s.logo };
      });
    return [...ORBIS_TOOLS.map(({ pattern: _pattern, ...tool }) => tool), ...servers];
  }

  private publish(id: string): HiringRound {
    const round = this.round(id);
    this.hub.bus.publish("hiring.updated", { round });
    return round;
  }

  private setRound(id: string, fields: { status: HiringRoundStatus; error?: string | null; requested?: number }): void {
    run(
      this.hub.db,
      "UPDATE hiring_rounds SET status = ?, error = ?, requested = COALESCE(?, requested), updated_at = ? WHERE id = ?",
      fields.status,
      fields.error ?? null,
      fields.requested ?? null,
      nowIso(),
      id,
    );
  }

  private setCandidate(id: string, status: CandidateStatus, fields: { error?: string | null; botId?: string | null } = {}): void {
    run(
      this.hub.db,
      "UPDATE hiring_candidates SET status = ?, error = ?, bot_id = COALESCE(?, bot_id) WHERE id = ?",
      status,
      fields.error ?? null,
      fields.botId ?? null,
      id,
    );
  }

  // --- the recruiter's brain -------------------------------------------------

  private recruiter(ref: string | null | undefined, field: string): Bot {
    if (!ref) throw badRequest("choose the bot whose brain writes the résumés", { [field]: "required" });
    let bot: Bot;
    try {
      bot = this.hub.botService.get(ref);
    } catch {
      throw badRequest(`no bot ${ref}`, { [field]: "unknown bot" });
    }
    if (!this.hub.brains.get(bot.brain.kind)) throw badRequest(`no brain ${bot.brain.kind}`, { [field]: "its brain is not available" });
    if (bot.spendCapUsd !== null && this.deps.usage.monthToDate(bot) >= bot.spendCapUsd) {
      throw conflict("spend_cap_reached", `${bot.name} reached its spend cap this month; raise it or choose another bot`);
    }
    return bot;
  }

  /** Ask a bot's brain, and count what it spent as one of its runs (usage, spend caps). */
  private async ask(bot: Bot, task: string, roundId: string, what: string): Promise<AskResult> {
    const adapter = this.hub.brains.get(bot.brain.kind)!;
    const answer = await askBrain(adapter, bot, task, RECRUITER_IDENTITY, {
      config: this.hub.config,
      secret: (name) => this.hub.secretResolvers.resolve(bot.id, name),
      timeoutMs: ASK_TIMEOUT_MS,
      scratch: "hiring",
    });
    const at = nowIso();
    const id = newId("run");
    const record: Run = {
      id,
      botId: bot.id,
      conversationId: null,
      trigger: { type: "hiring", ref: roundId },
      depth: 0,
      chainId: id,
      retryOf: null,
      status: "running",
      input: what,
      skill: null,
      steps: [],
      reply: null,
      usage: answer.usage,
      error: null,
      createdAt: at,
      startedAt: at,
      finishedAt: null,
    };
    this.hub.repos.runs.insert(record);
    this.hub.repos.runs.setUsage(id, answer.usage);
    this.hub.repos.runs.setStatus(id, answer.error ? "failed" : "done", {
      startedAt: at,
      finishedAt: nowIso(),
      error: answer.error,
      reply: answer.reply.slice(0, 4000),
    });
    this.addUsage(roundId, answer.usage);
    return answer;
  }

  private addUsage(roundId: string, u: Usage): void {
    run(
      this.hub.db,
      "UPDATE hiring_rounds SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, cost_usd = cost_usd + ? WHERE id = ?",
      u.inputTokens,
      u.outputTokens,
      u.costUsd,
      roundId,
    );
  }

  /** The work a round is about: the project's scope, or the group, its members and its latest messages. */
  private work(round: HiringRound): WorkContext {
    const group = round.groupId ? this.hub.repos.conversations.get(round.groupId) : undefined;
    if (round.basis === "project" || !group) return { basis: "project", brief: round.brief || "(the team's group was deleted)" };
    const name = (id: string | null) => (id ? (this.hub.repos.bots.get(id)?.name ?? "a bot") : "the user");
    const recent = this.hub.repos.items
      .list(group.id, { limit: 20 })
      .filter((i) => i.kind === "message" && i.text.trim())
      .map((i) => `${i.author.type === "bot" ? name(i.author.id) : "the user"}: ${i.text}`);
    const members = group.members.map((id) => this.hub.repos.bots.get(id)).filter((b): b is Bot => b !== undefined);
    return {
      basis: "team",
      brief: round.brief,
      team: { title: group.title, description: group.description, members: members.map((b) => ({ name: b.name, role: b.role })), recent },
    };
  }

  // --- generating résumés ----------------------------------------------------

  start(input: { basis: HiringBasis; brief?: string; groupId?: string; recruiterId: string; count: number; lang?: Lang }): HiringRound {
    const brief = (input.brief ?? "").trim();
    if (input.basis === "project" && !brief) throw badRequest("describe the project", { brief: "required for a project" });
    let groupId: string | null = null;
    if (input.basis === "team") {
      const group = input.groupId ? this.hub.repos.conversations.get(input.groupId) : undefined;
      if (!group || group.kind !== "group") throw badRequest("choose one of your groups", { groupId: "unknown group" });
      groupId = group.id;
    }
    const recruiter = this.recruiter(input.recruiterId, "recruiterId");
    const at = nowIso();
    const id = newId("hir");
    run(
      this.hub.db,
      `INSERT INTO hiring_rounds (id, basis, brief, group_id, recruiter_id, requested, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'generating', ?, ?)`,
      id,
      input.basis,
      brief,
      groupId,
      recruiter.id,
      input.count,
      at,
      at,
    );
    this.track(id, this.generate(id, recruiter, input.count, input.lang ?? "en"));
    return this.publish(id);
  }

  /** More résumés for a round, none repeating a name or a role already there. */
  more(roundId: string, count: number, lang: Lang = "en", recruiterId?: string): HiringRound {
    const round = this.round(roundId);
    if (round.status === "generating") throw conflict("hiring_busy", "this round is still writing résumés");
    const recruiter = this.recruiter(recruiterId ?? round.recruiterId, "recruiterId");
    if (recruiter.id !== round.recruiterId) run(this.hub.db, "UPDATE hiring_rounds SET recruiter_id = ? WHERE id = ?", recruiter.id, roundId);
    this.setRound(roundId, { status: "generating", requested: count });
    this.track(roundId, this.generate(roundId, recruiter, count, lang));
    return this.publish(roundId);
  }

  private async generate(roundId: string, recruiter: Bot, count: number, lang: Lang): Promise<void> {
    try {
      const round = this.round(roundId);
      const tools = this.tools();
      const team = this.hub.repos.bots.list().filter((b) => !b.hidden);
      const avoid = [...team.map((b) => (b.role ? `${b.name} (${b.role})` : b.name)), ...round.candidates.map((c) => `${c.name} (${c.role})`)];
      const answer = await this.ask(recruiter, candidatesTask(this.work(round), tools, count, avoid, lang), roundId, `hiring: ${count} résumés`);
      if (answer.error) return this.setRound(roundId, { status: "failed", error: `${recruiter.name}'s brain failed: ${answer.error}` });
      const taken = [...round.candidates.map((c) => c.name), ...team.map((b) => b.name)];
      const drafts = parseCandidates(answer.reply, new Set(tools.map((t) => t.id)), count, taken);
      if (!drafts.length) {
        const excerpt = answer.reply.replace(/\s+/g, " ").slice(0, 160);
        return this.setRound(roundId, {
          status: "failed",
          error: `${recruiter.name}'s brain answered no résumé in the format asked${excerpt ? `: “${excerpt}”` : ""}`,
        });
      }
      this.insertCandidates(roundId, drafts);
      this.setRound(roundId, { status: "ready" });
    } catch (err) {
      this.setRound(roundId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.publish(roundId);
    }
  }

  private insertCandidates(roundId: string, drafts: CandidateDraft[]): void {
    const last = get<{ n: number | null }>(this.hub.db, "SELECT MAX(position) AS n FROM hiring_candidates WHERE round_id = ?", roundId)?.n ?? -1;
    const at = nowIso();
    drafts.forEach((d, i) =>
      run(
        this.hub.db,
        `INSERT INTO hiring_candidates (id, round_id, position, name, role, headline, strengths, tools, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        newId("cand"),
        roundId,
        Number(last) + 1 + i,
        d.name,
        d.role,
        d.headline,
        JSON.stringify(d.strengths),
        JSON.stringify(d.tools),
        at,
      ),
    );
  }

  /** Dismiss a candidate, or bring one back. */
  mark(candidateId: string, status: "open" | "dismissed"): HiringRound {
    const c = this.candidate(candidateId);
    if (c.status === "hiring" || c.status === "hired")
      throw conflict("candidate_hired", `${c.name} is ${c.status === "hired" ? "already hired" : "being hired"}`);
    this.setCandidate(c.id, status);
    return this.publish(c.roundId);
  }

  delete(roundId: string): void {
    const round = this.round(roundId);
    if (round.status === "generating" || round.candidates.some((c) => c.status === "hiring")) {
      throw conflict("hiring_busy", "this round is still at work; wait for it to finish");
    }
    run(this.hub.db, "DELETE FROM hiring_rounds WHERE id = ?", roundId);
    this.hub.bus.publish("hiring.deleted", { roundId });
  }

  // --- hiring ------------------------------------------------------------------

  hire(candidateId: string, opts: HireOptions = {}): HiringRound {
    const c = this.candidate(candidateId);
    if (c.status !== "open") throw conflict("candidate_not_open", `${c.name} is ${c.status}`);
    const round = this.round(c.roundId);
    // The recruiter writes the profile; with the recruiter gone, the bot whose brain the hire gets does.
    const writerRef = round.recruiterId ?? opts.brainFrom;
    const writer = this.recruiter(writerRef, "brainFrom");
    const source = opts.brainFrom ? this.recruiter(opts.brainFrom, "brainFrom") : writer;
    if (opts.reportsTo) this.hub.botService.get(opts.reportsTo);
    this.setCandidate(c.id, "hiring");
    this.track(c.id, this.hireWork(c, round, writer, source, opts));
    return this.publish(c.roundId);
  }

  private async hireWork(c: Candidate, round: HiringRound, writer: Bot, source: Bot, opts: HireOptions): Promise<void> {
    const lang = opts.lang ?? "en";
    try {
      const tools = this.tools();
      const known = new Set(tools.map((t) => t.id));
      const answer = await this.ask(writer, personaTask(c, this.work(round), tools, lang), round.id, `hiring: the profile of ${c.name}`);
      if (answer.error) throw new Error(`${writer.name}'s brain failed: ${answer.error}`);
      const persona = parsePersona(answer.reply, known);
      if (!persona) throw new Error(`${writer.name}'s brain answered no profile in the format asked`);
      const bot = this.createBot(c, round, source, persona, opts, lang);
      this.setCandidate(c.id, "hired", { botId: bot.id });
    } catch (err) {
      this.setCandidate(c.id, "open", { error: err instanceof HttpError || err instanceof Error ? err.message : String(err) });
    } finally {
      this.publish(round.id);
    }
  }

  private createBot(c: Candidate, round: HiringRound, source: Bot, persona: Persona, opts: HireOptions, lang: Lang): Bot {
    const pt = lang === "pt-BR";
    const group = round.groupId ? this.hub.repos.conversations.get(round.groupId) : undefined;
    const reportsTo = opts.reportsTo !== undefined ? opts.reportsTo : round.basis === "team" ? (group?.leadBotId ?? null) : null;
    const list = (title: string, items: string[]) => (items.length ? `\n\n${title}\n${items.map((i) => `- ${i}`).join("\n")}` : "");
    const description = `${persona.description}${list(pt ? "Responsabilidades:" : "Responsibilities:", persona.responsibilities)}`;
    const bot = this.hub.botService.create({
      name: c.name,
      role: c.role,
      description,
      brain: structuredClone(source.brain),
      tools: allowlistFor(persona.tools.length ? persona.tools : c.tools),
      reportsTo,
    });
    // The brain's key goes with it: the hire works at once, as the bot it took the brain from.
    const keyName = source.brain.apiKeySecret;
    const key = keyName ? this.deps.vault.get(source.id, keyName) : null;
    if (keyName && key) this.deps.vault.set(bot.id, keyName, key);
    for (const skill of persona.skills) {
      try {
        this.deps.skills.save(bot.id, skillDocument(skill, skill.description), { create: true });
      } catch {
        /* a skill the store refuses is left out; the bot still works */
      }
    }
    if (group && opts.joinGroup !== false) {
      try {
        this.hub.conversationService.addMember(group.id, bot.id);
      } catch {
        /* a full group: the bot is hired all the same, outside it */
      }
    }
    const direct = this.hub.conversationService.directFor(bot.id);
    const intro =
      (persona.intro || (pt ? `Olá! Sou ${c.name}, ${c.role}.` : `Hello! I am ${c.name}, ${c.role}.`)) +
      list(pt ? "**O que vou fazer**" : "**What I will do**", persona.responsibilities) +
      list(pt ? "**Do que preciso**" : "**What I need**", persona.needs);
    this.hub.timeline.post({ conversationId: direct.id, kind: "message", author: { type: "bot", id: bot.id }, text: intro });
    return this.hub.botService.get(bot.id);
  }

  // --- the work in progress ---------------------------------------------------

  private track(id: string, work: Promise<void>): void {
    // Errors are written on the round or the candidate; nothing is left to throw here.
    const done = work
      .catch(() => undefined)
      .finally(() => {
        if (this.working.get(id) === done) this.working.delete(id);
      });
    this.working.set(id, done);
  }

  /** Wait for a round's generation or a candidate's hire (tests, shutdown). */
  async wait(id?: string): Promise<void> {
    if (id) await this.working.get(id);
    else await Promise.all(this.working.values());
  }

  // --- routes -----------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const LangSchema = Type.Optional(Type.Union([Type.Literal("en"), Type.Literal("pt-BR")]));
    const Count = Type.Integer({ minimum: 1, maximum: MAX_CANDIDATES });
    const Start = Type.Object(
      {
        basis: Type.Union([Type.Literal("project"), Type.Literal("team")]),
        brief: Type.Optional(Type.String({ maxLength: 4000 })),
        groupId: Type.Optional(Type.String({ minLength: 1 })),
        recruiterId: Type.String({ minLength: 1 }),
        count: Count,
        lang: LangSchema,
      },
      { additionalProperties: false },
    );
    const More = Type.Object({ count: Count, lang: LangSchema, recruiterId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false });
    const Mark = Type.Object({ status: Type.Union([Type.Literal("open"), Type.Literal("dismissed")]) }, { additionalProperties: false });
    const Hire = Type.Object(
      {
        brainFrom: Type.Optional(Type.String({ minLength: 1 })),
        reportsTo: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
        joinGroup: Type.Optional(Type.Boolean()),
        lang: LangSchema,
      },
      { additionalProperties: false },
    );

    app.get("/api/v1/hiring/tools", { schema: { tags: ["hiring"] } }, async () => this.tools());
    app.get("/api/v1/hiring/rounds", { schema: { tags: ["hiring"] } }, async () => this.rounds());
    app.post("/api/v1/hiring/rounds", { schema: { tags: ["hiring"], body: Start } }, async (req, reply) => {
      reply.code(202);
      return this.start(req.body);
    });
    app.get("/api/v1/hiring/rounds/:id", { schema: { tags: ["hiring"], params: IdParams } }, async (req) => this.round(req.params.id));
    app.post("/api/v1/hiring/rounds/:id/more", { schema: { tags: ["hiring"], params: IdParams, body: More } }, async (req, reply) => {
      reply.code(202);
      return this.more(req.params.id, req.body.count, req.body.lang, req.body.recruiterId);
    });
    app.delete("/api/v1/hiring/rounds/:id", { schema: { tags: ["hiring"], params: IdParams } }, async (req, reply) => {
      this.delete(req.params.id);
      reply.code(204);
    });
    app.patch("/api/v1/hiring/candidates/:id", { schema: { tags: ["hiring"], params: IdParams, body: Mark } }, async (req) =>
      this.mark(req.params.id, req.body.status),
    );
    app.post("/api/v1/hiring/candidates/:id/hire", { schema: { tags: ["hiring"], params: IdParams, body: Hire } }, async (req, reply) => {
      reply.code(202);
      return this.hire(req.params.id, req.body);
    });
  }
}
