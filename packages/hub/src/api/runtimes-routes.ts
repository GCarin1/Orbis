// Brains on this machine and the brain test (contracts/hub-surface § REST routes).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, BrainTestResult } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { badRequest, conflict } from "../errors.js";
import { localModelServers, runtimeHealth } from "../brains/health.js";
import { brainTestBot, testBrain } from "../brains/probe.js";
import type { CodexAccount } from "../brains/codex-account.js";
import { BrainSchema } from "./schemas.js";

const TestBody = Type.Object(
  {
    /** Test this bot's brain, with its secrets. */
    botId: Type.Optional(Type.String({ minLength: 1 })),
    /** Or test a brain configuration no bot uses yet. */
    brain: Type.Optional(BrainSchema),
  },
  { additionalProperties: false },
);

export async function registerRuntimeRoutes(root: FastifyInstance, ctx: HubContext, codex: CodexAccount): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();

  // ChatGPT through the Codex CLI: install it, sign in with the ChatGPT account, sign out.
  const LoginBody = Type.Object({ device: Type.Optional(Type.Boolean()) }, { additionalProperties: false });
  app.get("/api/v1/runtimes/codex/account", { schema: { tags: ["runtimes"] } }, async () => codex.status());
  app.post("/api/v1/runtimes/codex/install", { schema: { tags: ["runtimes"] } }, async (_req, reply) => {
    reply.code(202);
    return codex.install();
  });
  app.post("/api/v1/runtimes/codex/login", { schema: { tags: ["runtimes"], body: LoginBody } }, async (req, reply) => {
    reply.code(202);
    return codex.login(req.body.device ?? false);
  });
  app.post("/api/v1/runtimes/codex/cancel", { schema: { tags: ["runtimes"] } }, async () => codex.cancel());
  app.post("/api/v1/runtimes/codex/logout", { schema: { tags: ["runtimes"] } }, async () => codex.logout());
  const { config, brains, botService, secretResolvers } = ctx;
  // One test at a time per bot or brain kind: each one may start a CLI process.
  const running = new Set<string>();

  app.get("/api/v1/runtimes/health", { schema: { tags: ["runtimes"] } }, async () => runtimeHealth());

  app.get("/api/v1/runtimes/local", { schema: { tags: ["runtimes"] } }, async () =>
    localModelServers([
      { kind: "ollama", baseUrl: config.ollamaBaseUrl },
      { kind: "lmstudio", baseUrl: config.lmstudioBaseUrl },
    ]),
  );

  app.post("/api/v1/runtimes/test", { schema: { tags: ["runtimes"], body: TestBody } }, async (req, reply): Promise<BrainTestResult> => {
    const { botId, brain } = req.body;
    if ((botId === undefined) === (brain === undefined)) throw badRequest("give either botId or brain", { body: "botId or brain" });
    const bot: Bot = botId !== undefined ? botService.get(botId) : brainTestBot(brain as Bot["brain"]);
    const adapter = brains.get(bot.brain.kind);
    if (!adapter) throw badRequest(`no adapter for brain ${bot.brain.kind}`, { "brain.kind": bot.brain.kind });
    const key = botId !== undefined ? `bot:${bot.id}` : `brain:${bot.brain.kind}`;
    if (running.has(key)) throw conflict("test_running", "a test of this brain is already running");
    running.add(key);
    const controller = new AbortController();
    // Stop the brain when the caller goes away before the answer.
    reply.raw.once("close", () => {
      if (!reply.raw.writableFinished) controller.abort(new Error("cancelled"));
    });
    try {
      return await testBrain(adapter, bot, {
        config,
        signal: controller.signal,
        ...(botId !== undefined ? { secret: (name: string) => secretResolvers.resolve(bot.id, name) } : {}),
      });
    } finally {
      running.delete(key);
    }
  });
}
