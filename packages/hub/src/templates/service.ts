// Bot templates (specs/templates): one YAML document per bot, safe to share.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { Compile } from "typebox/compile";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { AVATAR_SHAPES, type AvatarShape, type Bot, type Brain, type RoutineApproval, type RoutineTrigger } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { badRequest, HttpError } from "../errors.js";
import type { RoutineService } from "../routines/service.js";
import type { SkillService } from "../skills/service.js";
import { BrainSchema, ComputerSchema, IdParams, PolicySchema } from "../api/schemas.js";

export const API_VERSION = "orbis/v1";
export const KIND = "BotTemplate";

export interface Finding {
  line: number;
  kind: string;
}

/** Patterns of credentials that must never leave in a template (specs/templates). */
const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "private key block", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { kind: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { kind: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "API key (sk-…)", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    kind: "password, token or secret assignment",
    re: /\b(?:password|passwd|pwd|token|secret|api[_-]?key)\b["']?\s*[:=]\s*["']?([^\s"'`,;{}]{12,})/i,
  },
];

/** Every line that looks like it holds a credential (the value itself is not reported). */
export function scanForSecrets(text: string): Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((raw, i) => {
    // `{{secret:NAME}}` placeholders are the safe way to name a credential: never a finding.
    const line = raw.replace(/\{\{secret:[A-Z][A-Z0-9_]{0,63}\}\}/g, "");
    for (const { kind, re } of PATTERNS) if (re.test(line)) findings.push({ line: i + 1, kind });
  });
  return findings;
}

export class SecretsFoundError extends HttpError {
  constructor(public readonly findings: Finding[]) {
    super(
      422,
      "secrets_found",
      `the template looks like it holds credentials (${findings.map((f) => `line ${f.line}: ${f.kind}`).join("; ")}); remove them — use {{secret:NAME}} placeholders instead`,
      Object.fromEntries(findings.map((f) => [`line ${f.line}`, f.kind])),
    );
  }
}

interface TemplateDoc {
  apiVersion: string;
  kind: string;
  metadata: { name: string; role?: string; description?: string; avatarColor?: string; avatarShape?: AvatarShape };
  spec: {
    brain?: Brain;
    policy?: Bot["policy"];
    computer?: Bot["computer"];
    tools?: string[];
    skills?: string[];
    ownSkills?: string[];
    spendCapUsd?: number | null;
    capIncludesSubscription?: boolean;
    routines?: Array<{ name: string; trigger: RoutineTrigger; instruction: string; approval?: RoutineApproval }>;
  };
}

const TemplateSchema = Type.Object({
  apiVersion: Type.String(),
  kind: Type.String(),
  metadata: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 80 }),
    role: Type.Optional(Type.String({ maxLength: 120 })),
    description: Type.Optional(Type.String({ maxLength: 20_000 })),
    avatarColor: Type.Optional(Type.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
    avatarShape: Type.Optional(Type.Union(AVATAR_SHAPES.map((s) => Type.Literal(s)))),
  }),
  spec: Type.Object({
    brain: Type.Optional(BrainSchema),
    policy: Type.Optional(PolicySchema),
    computer: Type.Optional(ComputerSchema),
    tools: Type.Optional(Type.Array(Type.String({ maxLength: 120 }), { maxItems: 200 })),
    skills: Type.Optional(Type.Array(Type.String({ maxLength: 64 }), { maxItems: 200 })),
    ownSkills: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200_000 }), { maxItems: 100 })),
    spendCapUsd: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
    capIncludesSubscription: Type.Optional(Type.Boolean()),
    routines: Type.Optional(
      Type.Array(
        Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          trigger: Type.Union([
            Type.Object({ type: Type.Literal("cron"), cron: Type.String(), timezone: Type.Optional(Type.String()) }),
            Type.Object({ type: Type.Literal("webhook") }),
          ]),
          instruction: Type.String({ minLength: 1, maxLength: 20_000 }),
          approval: Type.Optional(Type.Union([Type.Literal("normal"), Type.Literal("draft_only")])),
        }),
        { maxItems: 50 },
      ),
    ),
  }),
});
const validateTemplate = Compile(TemplateSchema);

/**
 * A computer configuration that travels: access to the user's own machine is
 * never exported nor imported — it is granted on each machine, by its user.
 */
export function portableComputer(computer: Bot["computer"]): Bot["computer"] {
  if (computer.provider !== "host") return computer;
  const { provider: _provider, hostDir: _hostDir, ...rest } = computer;
  return rest;
}

export class TemplateService {
  constructor(
    private readonly hub: HubContext,
    private readonly skills: SkillService,
    private readonly routines: RoutineService,
  ) {}

  /** The bot as a template document; throws SecretsFoundError when it looks like it holds a credential. */
  export(botRef: string): string {
    const bot = this.hub.botService.get(botRef);
    // Only these fields are copied: memory, history, computer state and secrets cannot slip in.
    const { apiKeySecret: _dropped, ...kept } = bot.brain;
    // A chat-http brain's addresses are the user's private endpoint: a shared template carries none of them
    // (not the request address, nor the Origin, history address and browser headers beside it).
    const { baseUrl: _private, chat, ...withoutUrl } = kept;
    const { origin: _o, historyUrl: _h, headers: _hd, ...sharedChat } = chat ?? {};
    const brain = bot.brain.kind === "chat-http" ? { ...withoutUrl, ...(Object.keys(sharedChat).length ? { chat: sharedChat } : {}) } : kept;
    const doc: TemplateDoc = {
      apiVersion: API_VERSION,
      kind: KIND,
      metadata: { name: bot.name, role: bot.role, description: bot.description, avatarColor: bot.avatar.color, avatarShape: bot.avatar.shape },
      spec: {
        brain,
        policy: bot.policy,
        computer: portableComputer(bot.computer),
        tools: bot.tools,
        skills: bot.skills,
        ownSkills: this.skills.store.list(bot.id).map((s) => s.content),
        spendCapUsd: bot.spendCapUsd,
        capIncludesSubscription: bot.capIncludesSubscription,
        routines: this.routines.repo.listForBot(bot.id).map((r) => ({ name: r.name, trigger: r.trigger, instruction: r.instruction, approval: r.approval })),
      },
    };
    const text = toYaml(doc, { lineWidth: 0 });
    const findings = scanForSecrets(text);
    if (findings.length) throw new SecretsFoundError(findings);
    return `# Orbis bot template — share it, commit it; it holds no memory, history or secrets.\n${text}`;
  }

  /** A new bot from a template; its routines start disabled. */
  import(yamlText: string): Bot {
    let doc: unknown;
    try {
      doc = parseYaml(yamlText);
    } catch (err) {
      throw badRequest("the template is not valid YAML", { yaml: err instanceof Error ? err.message.split("\n")[0]! : String(err) });
    }
    const head = (doc ?? {}) as Partial<TemplateDoc>;
    if (head.apiVersion !== API_VERSION) throw badRequest("unsupported template", { apiVersion: `must be "${API_VERSION}"` });
    if (head.kind !== KIND) throw badRequest("unsupported template", { kind: `must be "${KIND}"` });
    if (!validateTemplate.Check(doc)) {
      const first = [...validateTemplate.Errors(doc)][0] as { instancePath?: string; message?: string } | undefined;
      const field = (first?.instancePath ?? "").replace(/^\//, "").replace(/\//g, ".") || "template";
      throw badRequest("invalid template", { [field]: first?.message ?? "is invalid" });
    }
    const t = doc as TemplateDoc;
    // Validate every skill and routine before anything is created.
    const skills = (t.spec.ownSkills ?? []).map((content, i) => {
      try {
        return { content, name: this.skills.store.parse(content).name };
      } catch (err) {
        throw badRequest("invalid template", { [`spec.ownSkills.${i}`]: err instanceof Error ? err.message : String(err) });
      }
    });
    const bot = this.hub.botService.create({
      name: t.metadata.name,
      role: t.metadata.role,
      description: t.metadata.description,
      avatarColor: t.metadata.avatarColor,
      avatarShape: t.metadata.avatarShape,
      brain: t.spec.brain,
      policy: t.spec.policy,
      computer: t.spec.computer ? portableComputer(t.spec.computer) : undefined,
      tools: t.spec.tools,
      skills: t.spec.skills,
      spendCapUsd: t.spec.spendCapUsd ?? null,
      capIncludesSubscription: t.spec.capIncludesSubscription,
    });
    for (const skill of skills) this.skills.store.save(bot.id, skill.content, { create: true });
    for (const r of t.spec.routines ?? []) this.routines.create(bot.id, { name: r.name, trigger: r.trigger, instruction: r.instruction, approval: r.approval });
    return this.hub.botService.get(bot.id);
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    app.get("/api/v1/bots/:id/export", { schema: { tags: ["templates"], params: IdParams } }, async (req, reply) => {
      const bot = this.hub.botService.get(req.params.id);
      const text = this.export(bot.id);
      reply.type("text/yaml; charset=utf-8").header("content-disposition", `attachment; filename="${bot.handle}.orbis.yaml"`);
      return text;
    });
    app.post(
      "/api/v1/bots/import",
      { schema: { tags: ["templates"], body: Type.Object({ yaml: Type.String({ minLength: 1, maxLength: 2_000_000 }) }, { additionalProperties: false }) } },
      async (req, reply) => {
        reply.code(201);
        return this.import(req.body.yaml);
      },
    );
  }
}
