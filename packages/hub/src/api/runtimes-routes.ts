// Brains on this machine and the brain test (contracts/hub-surface § REST routes).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import {
  CHAT_HTTP_TOKEN_SECRET,
  cleanBearer,
  tokenExpiry,
  type Bot,
  type BrainTestResult,
  type ChatConnectionCheck,
  type ChatTokenStatus,
} from "@orbis/shared";
import type { HubContext } from "../context.js";
import { badRequest, conflict } from "../errors.js";
import { localModelServers, runtimeHealth } from "../brains/health.js";
import { brainTestBot, testBrain } from "../brains/probe.js";
import { checkConnection } from "../brains/chat-http.js";
import type { ClaudeAccount } from "../brains/claude-account.js";
import type { CodexAccount } from "../brains/codex-account.js";
import { BrainSchema, IdParams } from "./schemas.js";

const TestBody = Type.Object(
  {
    /** Test this bot's brain, with its secrets. */
    botId: Type.Optional(Type.String({ minLength: 1 })),
    /** Or test a brain configuration no bot uses yet. */
    brain: Type.Optional(BrainSchema),
  },
  { additionalProperties: false },
);

export async function registerRuntimeRoutes(root: FastifyInstance, ctx: HubContext, codex: CodexAccount, claude: ClaudeAccount): Promise<void> {
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

  // Claude Code: its account and the sign-in (the browser on this machine, or a page and the code it shows).
  const CodeBody = Type.Object({ code: Type.String({ minLength: 1, maxLength: 2_000 }) }, { additionalProperties: false });
  app.get("/api/v1/runtimes/claude/account", { schema: { tags: ["runtimes"] } }, async () => claude.status());
  app.post("/api/v1/runtimes/claude/login", { schema: { tags: ["runtimes"] } }, async (_req, reply) => {
    reply.code(202);
    return claude.login();
  });
  app.post("/api/v1/runtimes/claude/code", { schema: { tags: ["runtimes"], body: CodeBody } }, async (req) => {
    if (!claude.submitCode(req.body.code)) throw conflict("no_sign_in", "no sign-in is waiting for a code: press Sign in first");
    return { sent: true };
  });
  app.post("/api/v1/runtimes/claude/cancel", { schema: { tags: ["runtimes"] } }, async () => claude.cancel());
  const { config, brains, botService, secretResolvers } = ctx;
  // One test at a time per bot or brain kind: each one may start a CLI process.
  const running = new Set<string>();

  // Whether a chat-http bot's token is saved and when it expires: the vault never returns the token itself.
  app.get("/api/v1/bots/:id/chat-token", { schema: { tags: ["runtimes"], params: IdParams } }, async (req): Promise<ChatTokenStatus> => {
    const bot = botService.get(req.params.id);
    const token = cleanBearer(secretResolvers.resolve(bot.id, bot.brain.apiKeySecret || CHAT_HTTP_TOKEN_SECRET) ?? "");
    const expires = token ? tokenExpiry(token) : null;
    return { saved: token !== "", expiresAt: expires?.toISOString() ?? null, expired: expires !== null && expires.getTime() <= Date.now() };
  });

  // A chat-http bot: which ways out of this computer reach its chat API past the firewall (no message is sent).
  app.post("/api/v1/bots/:id/chat-check", { schema: { tags: ["runtimes"], params: IdParams } }, async (req): Promise<ChatConnectionCheck> => {
    const bot = botService.get(req.params.id);
    if (bot.brain.kind !== "chat-http" || !bot.brain.baseUrl?.trim())
      throw badRequest("this bot does not use a chat API over cURL", { brain: "chat-http with an address" });
    const token = cleanBearer(secretResolvers.resolve(bot.id, bot.brain.apiKeySecret || CHAT_HTTP_TOKEN_SECRET) ?? "");
    if (!token) throw badRequest("no Bearer token is saved for this bot", { token: "required" });
    const key = `check:${bot.id}`;
    if (running.has(key)) throw conflict("test_running", "a connection test of this bot is already running");
    running.add(key);
    try {
      return await checkConnection(bot, token);
    } finally {
      running.delete(key);
    }
  });

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
