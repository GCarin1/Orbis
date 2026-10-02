// Memory entries: tools, run summaries and the REST routes (specs/memory).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { HubContext } from "../context.js";
import { notFound } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import type { MemoryEntry, MemoryKind } from "../repos/memory.js";
import type { RunHooks } from "../runs/engine.js";
import type { ToolDefinition } from "../tools/registry.js";
import { IdParams } from "../api/schemas.js";

const SUMMARY_CHARS = 500;
/** The run summaries a bot keeps; older ones are forgotten (its own notes and the team's are never pruned). */
export const MAX_SUMMARIES = 200;
const Kind = Type.Union([Type.Literal("preference"), Type.Literal("role"), Type.Literal("fact"), Type.Literal("summary")]);

export class MemoryService {
  constructor(private readonly hub: HubContext) {}

  add(botId: string | null, kind: MemoryKind, text: string, source: string): MemoryEntry {
    const at = nowIso();
    return this.hub.repos.memory.insert({ id: newId("mem"), botId, kind, text: text.trim(), source, createdAt: at, updatedAt: at });
  }

  get(id: string): MemoryEntry {
    const entry = this.hub.repos.memory.get(id);
    if (!entry) throw notFound(`memory entry ${id}`);
    return entry;
  }

  tools(): ToolDefinition[] {
    return [
      {
        name: "memory.save",
        description:
          "Remember something for later runs: a user preference, a fact about your role or project. Use scope team only for facts every bot of the team should know.",
        input: Type.Object({
          text: Type.String({ minLength: 1, maxLength: 4000 }),
          kind: Type.Optional(Type.Union([Type.Literal("preference"), Type.Literal("role"), Type.Literal("fact")])),
          scope: Type.Optional(Type.Union([Type.Literal("bot"), Type.Literal("team")])),
        }),
        risk: "write",
        handler: async (input: { text: string; kind?: MemoryKind; scope?: "bot" | "team" }, ctx) => {
          const entry = this.add(input.scope === "team" ? null : ctx.bot.id, input.kind ?? "fact", input.text, `run:${ctx.run.id}`);
          return `saved ${entry.kind} ${entry.id}${entry.botId === null ? " for the whole team" : ""}`;
        },
      },
      {
        name: "memory.search",
        description: "Search your memory and the team's memory by words; best matches first.",
        input: Type.Object({
          query: Type.String({ minLength: 1, maxLength: 1000 }),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
        }),
        risk: "read",
        handler: async (input: { query: string; limit?: number }, ctx) => {
          const found = this.hub.repos.memory.search(ctx.bot.id, input.query, input.limit ?? 8);
          if (found.length === 0) return "nothing found";
          return JSON.stringify(
            found.map((m) => ({ id: m.id, kind: m.kind, scope: m.botId === null ? "team" : "bot", text: m.text, at: m.createdAt })),
            null,
            2,
          );
        },
      },
    ];
  }

  /**
   * A successful run of the bot's own work (a message, a handoff, a routine,
   * an API call) leaves a summary: the task and the start of the reply. An
   * answer to a colleague's mention or a report is not its own work, the same
   * summary is kept once, and a bot keeps its newest MAX_SUMMARIES.
   */
  hooks(): RunHooks {
    return {
      onFinished: (run) => {
        if (run.status !== "done" || !run.reply) return;
        if (run.trigger.type === "mention" || run.trigger.type === "report") return;
        const task = run.input.length > 300 ? `${run.input.slice(0, 300)}…` : run.input;
        const text = `Task: ${task}\nResult: ${run.reply.slice(0, SUMMARY_CHARS)}`;
        if (this.hub.repos.memory.has(run.botId, "summary", text)) return;
        this.add(run.botId, "summary", text, `run:${run.id}`);
        this.hub.repos.memory.prune(run.botId, "summary", MAX_SUMMARIES);
      },
    };
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Body = Type.Object({ kind: Kind, text: Type.String({ minLength: 1, maxLength: 4000 }) }, { additionalProperties: false });
    const Patch = Type.Object(
      { kind: Type.Optional(Kind), text: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })) },
      { additionalProperties: false },
    );
    const Query = Type.Object({ scope: Type.Optional(Type.Literal("team")) });

    app.get("/api/v1/bots/:id/memory", { schema: { tags: ["memory"], params: IdParams } }, async (req) =>
      this.hub.repos.memory.list(this.hub.botService.get(req.params.id).id),
    );
    app.post("/api/v1/bots/:id/memory", { schema: { tags: ["memory"], params: IdParams, body: Body } }, async (req, reply) => {
      reply.code(201);
      return this.add(this.hub.botService.get(req.params.id).id, req.body.kind, req.body.text, "user");
    });
    app.get("/api/v1/memory", { schema: { tags: ["memory"], querystring: Query } }, async () => this.hub.repos.memory.list(null));
    app.post("/api/v1/memory", { schema: { tags: ["memory"], body: Body } }, async (req, reply) => {
      reply.code(201);
      return this.add(null, req.body.kind, req.body.text, "user");
    });
    app.patch("/api/v1/memory/:id", { schema: { tags: ["memory"], params: IdParams, body: Patch } }, async (req) => {
      this.get(req.params.id);
      this.hub.repos.memory.update(req.params.id, req.body, nowIso());
      return this.get(req.params.id);
    });
    app.delete("/api/v1/memory/:id", { schema: { tags: ["memory"], params: IdParams } }, async (req, reply) => {
      this.get(req.params.id);
      this.hub.repos.memory.delete(req.params.id);
      reply.code(204);
      return null;
    });
  }
}
