// Skills for bots (specs/skills): REST routes, the skills.* tools, the offered
// list in every run's context, `/<skill>` invocations, and Claude Code's own
// skill folder in the bot's workspace.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { RunHooks } from "../runs/engine.js";
import type { SkillResolution } from "../services/conversations.js";
import type { ToolDefinition } from "../tools/registry.js";
import { info, SkillError, SkillExistsError, SkillMissingError, SkillStore } from "./store.js";

/** Leading mentions, then `/name`, then the input. */
const INVOCATION = /^(?:@[a-z0-9-]+\s+)*\/([a-z0-9-]{1,64})(?:\s+([\s\S]*))?$/i;
const MANIFEST = ".orbis-skills.json";

export class SkillService {
  readonly store: SkillStore;

  constructor(private readonly hub: HubContext) {
    this.store = new SkillStore(hub.config.dataDir);
  }

  /** `botId` query values accept an id or a handle; absent means the account scope. */
  private scope(botRef: string | undefined): string | null {
    return botRef ? this.hub.botService.get(botRef).id : null;
  }

  private guard<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof SkillError) throw badRequest(err.message, err.fields);
      if (err instanceof SkillExistsError) throw conflict("skill_exists", err.message);
      if (err instanceof SkillMissingError) throw notFound(err.message.replace(/ not found$/, ""));
      throw err;
    }
  }

  // --- invocation -------------------------------------------------------------

  resolve(bot: Bot, text: string): SkillResolution {
    const m = INVOCATION.exec(text.trim());
    if (!m) return { kind: "none" };
    const name = m[1]!.toLowerCase();
    // `/name` is a skill invocation only when such a skill exists somewhere;
    // other slash words (a CLI's own commands) pass through as text.
    if (!this.store.existsAnywhere(name)) return { kind: "none" };
    const skill = this.store.offered(bot).find((s) => s.name === name);
    if (!skill) return { kind: "unavailable", name };
    return { kind: "skill", skill: { name, body: skill.body }, input: m[2]?.trim() || `Run the skill /${name}.` };
  }

  /** The offered skills, for the system text of every run. */
  contextSection(bot: Bot): string | null {
    const offered = this.store.offered(bot);
    if (offered.length === 0) return null;
    return [
      "Skills you can use (read one with skills.read before following it; the user can also invoke one with /name):",
      ...offered.map((s) => `- ${s.name}: ${s.description}${s.when ? ` (when: ${s.when})` : ""}`),
    ].join("\n");
  }

  /** Claude Code loads skills from `.claude/skills/<name>/SKILL.md` in its working directory. */
  materialize(bot: Bot): void {
    const dir = path.join(this.hub.computer.ensureWorkspace(bot.id), ".claude", "skills");
    const manifest = path.join(dir, MANIFEST);
    let previous: string[] = [];
    try {
      previous = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")) as string[]) : [];
    } catch {
      previous = [];
    }
    const offered = this.store.offered(bot);
    const names = new Set(offered.map((s) => s.name));
    // Remove only the skills Orbis wrote before and no longer offers; the user's own stay.
    for (const name of previous) {
      if (!names.has(name) && /^[a-z0-9-]{1,64}$/.test(name)) rmSync(path.join(dir, name), { recursive: true, force: true });
    }
    for (const skill of offered) {
      mkdirSync(path.join(dir, skill.name), { recursive: true });
      writeFileSync(path.join(dir, skill.name, "SKILL.md"), skill.content);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(manifest, JSON.stringify([...names]));
  }

  hooks(): RunHooks {
    return {
      onStarted: (run) => {
        const bot = this.hub.repos.bots.get(run.botId);
        if (bot?.brain.kind === "claude-code") this.materialize(bot);
      },
    };
  }

  // --- tools --------------------------------------------------------------------

  tools(): ToolDefinition[] {
    return [
      {
        name: "skills.list",
        description: "List the skills you are offered: reusable procedures with a name and a description.",
        input: Type.Object({}),
        risk: "read",
        handler: async (_input: object, ctx) => {
          const offered = this.store.offered(ctx.bot);
          if (offered.length === 0) return "no skills are offered to you";
          return offered.map((s) => `${s.name} (${s.scope}): ${s.description}${s.when ? ` — when: ${s.when}` : ""}`).join("\n");
        },
      },
      {
        name: "skills.read",
        description: "Read the full instructions of one of your skills before following it.",
        input: Type.Object({ name: Type.String({ minLength: 1, maxLength: 64 }) }),
        risk: "read",
        handler: async (input: { name: string }, ctx) => {
          const skill = this.store.offered(ctx.bot).find((s) => s.name === input.name);
          if (!skill) return { output: `no skill "${input.name}" is offered to you (skills.list shows yours)`, isError: true };
          return `# ${skill.name}\n${skill.description}\n\n${skill.body}`;
        },
      },
    ];
  }

  // --- REST -----------------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Scope = Type.Object({ botId: Type.Optional(Type.String({ minLength: 1 })), offered: Type.Optional(Type.Boolean()) });
    const NameParams = Type.Object({ name: Type.String({ minLength: 1 }) });
    const Body = Type.Object({ content: Type.String({ minLength: 1, maxLength: 200_000 }), botId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false });
    const Content = Type.Object({ content: Type.String({ minLength: 1, maxLength: 200_000 }) }, { additionalProperties: false });

    app.get("/api/v1/skills", { schema: { tags: ["skills"], querystring: Scope } }, async (req) => {
      if (req.query.offered) {
        if (!req.query.botId) throw badRequest("offered needs a botId", { botId: "required with offered=true" });
        return this.store.offered(this.hub.botService.get(req.query.botId)).map(info);
      }
      return this.store.list(this.scope(req.query.botId)).map(info);
    });
    app.post("/api/v1/skills", { schema: { tags: ["skills"], body: Body } }, async (req, reply) => {
      const skill = this.guard(() => this.store.save(this.scope(req.body.botId), req.body.content, { create: true }));
      reply.code(201);
      return skill;
    });
    app.get("/api/v1/skills/:name", { schema: { tags: ["skills"], params: NameParams, querystring: Scope } }, async (req) => {
      const skill = this.store.get(this.scope(req.query.botId), req.params.name);
      if (!skill) throw notFound(`skill "${req.params.name}"`);
      return skill;
    });
    app.put("/api/v1/skills/:name", { schema: { tags: ["skills"], params: NameParams, querystring: Scope, body: Content } }, async (req) =>
      this.guard(() => this.store.save(this.scope(req.query.botId), req.body.content, { create: false, expectName: req.params.name })),
    );
    app.delete("/api/v1/skills/:name", { schema: { tags: ["skills"], params: NameParams, querystring: Scope } }, async (req, reply) => {
      if (!this.store.delete(this.scope(req.query.botId), req.params.name)) throw notFound(`skill "${req.params.name}"`);
      reply.code(204);
      return null;
    });
  }
}
