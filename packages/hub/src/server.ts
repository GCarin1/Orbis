// createHub: wire configuration, database, repositories, services, the run
// engine and the HTTP surface into one hub (specs/hub-api).
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import fastifyStatic from "@fastify/static";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import { ORBIS_VERSION } from "@orbis/shared";
import { EventBus } from "./bus.js";
import { loadConfig, type ConfigOverrides, type Env, type HubConfig } from "./config.js";
import { ComputerManager, type ComputerProvider } from "./computer/manager.js";
import { DockerProvider } from "./computer/docker.js";
import { BrowserService } from "./computer/browser.js";
import { computerTools } from "./computer/tools.js";
import { registerComputerRoutes, VncSessions } from "./computer/routes.js";
import { ComputerSetup } from "./computer/setup.js";
import { SkillService } from "./skills/service.js";
import { RoutineService } from "./routines/service.js";
import { SecretService } from "./secrets/service.js";
import { UsageService } from "./usage/service.js";
import { TemplateService } from "./templates/service.js";
import { openDatabase, type Database } from "./db/index.js";
import { HttpError } from "./errors.js";
import { HubAuth } from "./auth/account.js";
import { BotsRepo } from "./repos/bots.js";
import { ConversationsRepo, ItemsRepo } from "./repos/conversations.js";
import { MemoryRepo } from "./repos/memory.js";
import { BrainSessionsRepo, RunsRepo } from "./repos/runs.js";
import { RunEngine } from "./runs/engine.js";
import { BotService } from "./services/bots.js";
import { ConversationService } from "./services/conversations.js";
import { Timeline } from "./services/timeline.js";
import { BrainRegistry, type BrainAdapter } from "./brains/types.js";
import { mockBrain } from "./brains/mock.js";
import { claudeCodeBrain } from "./brains/claude-code.js";
import { customCliBrain } from "./brains/custom-cli.js";
import { anthropicBrain } from "./brains/anthropic.js";
import { chatHttpBrain } from "./brains/chat-http.js";
import { openaiBrain, ollamaBrain, lmstudioBrain } from "./brains/openai.js";
import { codexBrain } from "./brains/codex.js";
import { geminiBrain } from "./brains/gemini.js";
import { registerRuntimeRoutes } from "./api/runtimes-routes.js";
import { cursorBrain } from "./brains/cursor.js";
import { ClaudeAccount } from "./brains/claude-account.js";
import { CodexAccount } from "./brains/codex-account.js";
import { registerOpenAiCompat } from "./api/openai-compat.js";
import { registerGroupRoutes } from "./api/groups-routes.js";
import { registerPairingRoutes } from "./api/pairing-routes.js";
import { Collaboration } from "./collab/handoff.js";
import { MemoryService } from "./collab/memory.js";
import { registerCoreRoutes } from "./api/routes.js";
import { registerStream } from "./api/stream.js";
import { registerApprovalRoutes } from "./api/approvals-routes.js";
import { ApprovalsRepo } from "./repos/approvals.js";
import { ApprovalService } from "./approvals/service.js";
import { DraftService } from "./approvals/drafts.js";
import { ToolRegistry } from "./tools/registry.js";
import { ToolGateway } from "./tools/gateway.js";
import { builtinTools } from "./tools/builtin.js";
import { permissionTool } from "./tools/permission.js";
import { registerMcp } from "./mcp/protocol.js";
import { type HubContext, MentionAliases, SecretResolvers } from "./context.js";
import { SettingsRepo } from "./repos/settings.js";
import { VoiceService } from "./voice/service.js";
import { SquadService } from "./squads/service.js";
import { HiringService } from "./hiring/service.js";
import { McpConnections } from "./mcp/connections.js";
import { registerMcpRoutes } from "./mcp/routes.js";
import { FilesService } from "./files/service.js";
import { InitiativeService } from "./initiative/service.js";
import { HealthService } from "./health/service.js";

export interface HubOptions {
  env?: Env;
  config?: ConfigOverrides;
  /** Computer providers replacing the built-in ones of the same kind (tests pass a recorded docker), or extra ones. */
  computerProviders?: ComputerProvider[];
  /** What the computers need on this machine (tests pass one with a recorded docker). */
  computerSetup?: ComputerSetup;
  /** Replace or add brain adapters (tests register fakes here). */
  brains?: BrainAdapter[];
  /** Fastify request logging; off by default. */
  logger?: boolean;
  /** The clock routines schedule by (tests drive time with it). */
  clock?: () => Date;
  /** The dice a bot's initiative rolls (tests make it always or never write). */
  random?: () => number;
  /** How long MCP updates are gathered, and how soon a watched server starts again (tests shorten them). */
  mcp?: { updateBatchMs?: number; watchRetryMs?: number[] };
  /** How account sessions are checked: the project's keys fetched with `fetch`, and the clock (tests fake both). */
  auth?: { fetch?: typeof fetch; now?: () => number };
}

export interface Hub extends HubContext {
  app: FastifyInstance;
  auth: HubAuth;
  skills: SkillService;
  routines: RoutineService;
  secrets: SecretService;
  usage: UsageService;
  voice: VoiceService;
  mcp: McpConnections;
  hiring: HiringService;
  squads: SquadService;
  files: FilesService;
  initiative: InitiativeService;
  health: HealthService;
  /** Start listening; resolves with the base URL. */
  listen(): Promise<string>;
  close(): Promise<void>;
}

/** Locate the built web app shipped with @orbis/web, if it exists. */
export function defaultWebDir(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("@orbis/web/package.json");
    const dist = path.join(path.dirname(pkg), "dist");
    return existsSync(path.join(dist, "index.html")) ? dist : null;
  } catch {
    return null;
  }
}

/** Paths that carry their own authentication or none (health, webhooks, MCP run tokens, static files). */
function needsAuth(url: string): "bearer" | "stream" | "file" | null {
  const p = url.split("?")[0]!;
  // Browsers cannot set a WebSocket's headers: the stream opens with a one-time ticket (api/stream.ts).
  if (p === "/api/v1/stream") return "stream";
  // A file's content opens in an <img>, a player or a download, which send no Authorization header: a file key.
  if (/^\/api\/v1\/files\/[^/]+\/content$/.test(p)) return "file";
  // A phone trades a pairing code for the token: it has no token yet (api/pairing-routes.ts).
  if (p === "/api/v1/pairing/claim") return null;
  // Before signing in, the page asks where accounts sign in (auth/account.ts).
  if (p === "/api/v1/auth/config") return null;
  if (p.startsWith("/api/") || p.startsWith("/v1/")) return "bearer";
  return null;
}

function validationFields(errors: unknown[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const e of errors as Array<Record<string, unknown>>) {
    const raw = String(e.instancePath ?? e.path ?? "");
    let key = raw.replace(/^\//, "").replace(/\//g, ".");
    const params = e.params as Record<string, unknown> | undefined;
    if (params && typeof params.missingProperty === "string") {
      key = key ? `${key}.${params.missingProperty}` : params.missingProperty;
    } else if (params && Array.isArray(params.requiredProperties) && params.requiredProperties.length) {
      key = key ? `${key}.${params.requiredProperties[0]}` : String(params.requiredProperties[0]);
    } else if (params && typeof params.additionalProperty === "string") {
      key = key ? `${key}.${params.additionalProperty}` : params.additionalProperty;
    } else if (params && Array.isArray(params.additionalProperties) && params.additionalProperties.length) {
      key = key ? `${key}.${params.additionalProperties[0]}` : String(params.additionalProperties[0]);
    }
    fields[key || "body"] = String(e.message ?? "is invalid");
  }
  return fields;
}

export async function createHub(opts: HubOptions = {}): Promise<Hub> {
  const config: HubConfig = loadConfig(opts.env ?? process.env, {
    webDir: opts.config?.webDir === undefined ? defaultWebDir() : opts.config.webDir,
    ...opts.config,
  });
  const db: Database = openDatabase(config.dataDir);
  const bus = new EventBus();
  const repos = {
    bots: new BotsRepo(db),
    conversations: new ConversationsRepo(db),
    items: new ItemsRepo(db),
    runs: new RunsRepo(db),
    sessions: new BrainSessionsRepo(db),
    memory: new MemoryRepo(db),
    approvals: new ApprovalsRepo(db),
  };
  const brains = new BrainRegistry();
  for (const adapter of [mockBrain, anthropicBrain, openaiBrain, ollamaBrain, lmstudioBrain, claudeCodeBrain, codexBrain, geminiBrain, cursorBrain, customCliBrain, chatHttpBrain]) {
    brains.register(adapter);
  }
  for (const adapter of opts.brains ?? []) brains.register(adapter);

  const computer = new ComputerManager(config.dataDir, {
    defaultProvider: config.computerProvider,
    providers: [new DockerProvider(), ...(opts.computerProviders ?? [])],
    bus,
    bots: repos.bots,
  });
  const browser = new BrowserService(computer, config.browserExecutable);
  computer.startSweeper();
  const timeline = new Timeline(repos.items, repos.conversations, repos.bots, bus);
  const secretResolvers = new SecretResolvers();
  const mentionAliases = new MentionAliases();
  const engine = new RunEngine({
    config,
    bus,
    bots: repos.bots,
    items: repos.items,
    runs: repos.runs,
    sessions: repos.sessions,
    memory: repos.memory,
    brains,
    computer,
    timeline,
    secret: (botId, name) => secretResolvers.resolve(botId, name),
  });
  const botService = new BotService({ db, config, bots: repos.bots, bus, engine, computer });
  const conversationService = new ConversationService({
    config,
    bus,
    bots: repos.bots,
    botService,
    conversations: repos.conversations,
    items: repos.items,
    timeline,
    engine,
    runs: repos.runs,
    sessions: repos.sessions,
    memory: repos.memory,
    mentionAliases,
  });
  // A deleted bot leaves its groups (said in each) before its rows go.
  botService.onDelete((bot) => conversationService.botDeleted(bot));

  const approvals = new ApprovalService({ repo: repos.approvals, bus, timeline, engine, botService });
  const drafts = new DraftService(repos.items, timeline, config.dataDir);
  const tools = new ToolRegistry();
  let listeningUrl: string | null = null;
  const url = () => listeningUrl ?? `http://${config.host}:${config.port}`;
  const gateway = new ToolGateway(tools, approvals, url);
  engine.setToolHost(gateway);

  // Runs left running, or waiting for the user, by a previous process cannot resume: close them honestly.
  const close = (status: string, to: "failed" | "cancelled", error: string) => {
    for (let batch = repos.runs.list({ status, limit: 500 }); batch.length; batch = repos.runs.list({ status, limit: 500 })) {
      for (const run of batch) repos.runs.setStatus(run.id, to, { finishedAt: new Date().toISOString(), error });
    }
  };
  close("running", "failed", "the hub stopped during this run");
  close("waiting", "failed", "the hub stopped during this run");
  // No run survives a restart, so no bot is still thinking or working.
  for (const bot of repos.bots.list({ includeHidden: true })) {
    if (bot.state !== "idle" && bot.state !== "done") repos.bots.setState(bot.id, "idle");
  }
  close("queued", "cancelled", "the hub stopped before this run started");
  // A handoff whose run was closed above never ends on its own: show it failed.
  for (const item of repos.items.openCards("handoff", ["queued", "running"])) {
    repos.items.setCard(item.id, { ...item.card!, state: "failed", data: { ...item.card!.data, error: "the hub stopped before this handoff ended" } }, new Date().toISOString());
  }

  const app = Fastify({
    logger: opts.logger ? { level: config.logLevel } : false,
    bodyLimit: 2 * 1024 * 1024,
    // Stream sockets (and a refused upgrade) must not keep close() waiting.
    forceCloseConnections: true,
  });
  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send(error.toBody());
    }
    if (error.validation) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "the request does not match its schema", fields: validationFields(error.validation) },
      });
    }
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) app.log.error(error);
    return reply.code(status).send({
      error: { code: status === 500 ? "internal" : (error.code ?? "bad_request").toLowerCase(), message: error.message },
    });
  });

  // Registered before the auth hook: its onRequest hook marks upgrade requests so a
  // refused upgrade (401) still has its socket destroyed.
  await app.register(websocket);
  const vncSessions = new VncSessions();
  const auth = new HubAuth(config, new SettingsRepo(db), opts.auth);
  app.addHook("onRequest", async (req) => {
    const mode = needsAuth(req.url);
    if (!mode) return;
    // noVNC pages inside an iframe authenticate with their path-scoped cookie.
    if (vncSessions.allows(req.url, req.headers.cookie)) return;
    await auth.authenticate(req, mode);
    // Any authenticated change is user activity (routines pause after a long absence).
    if (mode === "bearer" && req.method !== "GET" && req.method !== "HEAD") routines.recordActivity();
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: { title: "Orbis hub API", version: ORBIS_VERSION, description: "REST API of the Orbis hub." },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
      security: [{ bearer: [] }],
    },
  });

  const ctx: HubContext = {
    config,
    db,
    bus,
    repos,
    brains,
    computer,
    browser,
    timeline,
    engine,
    botService,
    conversationService,
    secretResolvers,
    mentionAliases,
    tools,
    approvals,
    drafts,
    gateway,
    url,
  };
  for (const tool of builtinTools(ctx, drafts)) tools.register(tool);
  tools.register(permissionTool(approvals, tools));
  const collaboration = new Collaboration(ctx);
  tools.register(collaboration.handoffTool());
  engine.addHooks(collaboration.hooks());
  engine.addContextSection((bot) => collaboration.contextSection(bot));
  engine.addContextSection((bot) => computer.contextSection(bot));
  engine.addContextSection((bot, run) => conversationService.contextSection(bot, run));
  const memoryService = new MemoryService(ctx);
  for (const tool of memoryService.tools()) tools.register(tool);
  engine.addHooks(memoryService.hooks());
  for (const tool of computerTools(computer, browser)) tools.register(tool);
  const skillService = new SkillService(ctx);
  for (const tool of skillService.tools()) tools.register(tool);
  engine.addHooks(skillService.hooks());
  engine.addContextSection((bot) => skillService.contextSection(bot));
  conversationService.setSkillResolver((bot, text) => skillService.resolve(bot, text));
  const files = new FilesService(ctx, opts.clock);
  conversationService.setAttachmentHandler(files);
  for (const tool of files.tools()) tools.register(tool);
  files.start();
  const secrets = new SecretService(ctx);
  secrets.wire();
  for (const tool of secrets.tools()) tools.register(tool);
  const voice = new VoiceService(config, new SettingsRepo(db), secrets.hubSecrets);
  const mcp = new McpConnections(ctx, secrets.hubSecrets, { redirectUri: () => `${url()}/oauth/mcp/callback`, ...opts.mcp });
  mcp.start();
  const usage = new UsageService(ctx, opts.clock);
  engine.addHooks(usage.hooks());
  const routines = new RoutineService(ctx, drafts, opts.clock);
  for (const tool of routines.tools()) tools.register(tool);
  engine.addHooks(routines.hooks());
  gateway.onBeforeCall(routines.draftOnlyHook());
  routines.start();
  const initiative = new InitiativeService(ctx, new SettingsRepo(db), opts.clock, opts.random);
  engine.addHooks(initiative.hooks());
  initiative.start();
  // A server's updates reach the bots that watch it (change 0061).
  mcp.onUpdates((server, updates, watchers, dropped) => void initiative.mcpUpdates(server, updates, watchers, dropped));
  mcp.startWatching();
  const health = new HealthService(ctx, new SettingsRepo(db), opts.clock);
  for (const tool of health.tools()) tools.register(tool);
  const templates = new TemplateService(ctx, skillService, routines);
  const hiring = new HiringService(ctx, { skills: skillService.store, vault: secrets.vault, mcp, usage });
  const squads = new SquadService(ctx);
  mentionAliases.register(() => squads.aliases());
  engine.addContextSection((bot) => squads.contextSection(bot));
  for (const tool of squads.tools()) tools.register(tool);
  botService.onDelete((bot) => squads.botDeleted(bot));
  tools.register(routines.callTool(collaboration));
  // While the user holds a bot's computer, its tool calls wait (specs/computer: takeover).
  gateway.onBeforeCall(async ({ run, bot, signal }) => {
    if (!computer.holdsTakeover(bot.id)) return;
    engine.markWaiting(run.id, true);
    try {
      await computer.waitForControl(bot.id, signal);
    } finally {
      engine.markWaiting(run.id, false);
    }
  });
  approvals.expireStale();

  app.get("/health", { schema: { hide: true } }, async () => ({ ok: true, version: config.version }));
  await registerCoreRoutes(app, ctx);
  await registerStream(app, ctx);
  await registerApprovalRoutes(app, ctx);
  await registerMcp(app, gateway);
  await registerOpenAiCompat(app, ctx);
  await registerGroupRoutes(app, ctx);
  await registerPairingRoutes(app, ctx);
  await auth.routes(app);
  await memoryService.routes(app);
  await registerComputerRoutes(app, ctx, browser, vncSessions, opts.computerSetup ?? new ComputerSetup(config.computerProvider));
  await skillService.routes(app);
  await routines.routes(app);
  await secrets.routes(app);
  await usage.routes(app);
  await templates.routes(app);
  const codexAccount = new CodexAccount();
  const claudeAccount = new ClaudeAccount(undefined, secrets.claudeToken);
  await registerRuntimeRoutes(app, ctx, codexAccount, claudeAccount, secrets.claudeToken);
  await voice.routes(app);
  await registerMcpRoutes(app, mcp);
  await hiring.routes(app);
  await squads.routes(app);
  await files.routes(app);
  await initiative.routes(app);
  await health.routes(app);
  app.get("/api/v1/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  if (config.webDir) {
    await app.register(fastifyStatic, { root: config.webDir, prefix: "/", wildcard: false, index: ["index.html"] });
  }
  app.setNotFoundHandler((req, reply) => {
    const p = req.url.split("?")[0]!;
    const isApi = p.startsWith("/api/") || p.startsWith("/v1/") || p.startsWith("/mcp") || p.startsWith("/hooks/");
    if (req.method === "GET" && !isApi && config.webDir) {
      return reply.type("text/html").sendFile("index.html");
    }
    return reply.code(404).send({ error: { code: "not_found", message: `${req.method} ${p} not found` } });
  });

  let closed = false;
  const hub: Hub = {
    ...ctx,
    auth,
    skills: skillService,
    routines,
    secrets,
    usage,
    voice,
    mcp,
    hiring,
    squads,
    files,
    initiative,
    health,
    app,
    async listen() {
      const address = await app.listen({ port: config.port, host: config.host });
      listeningUrl = address.replace("[::1]", "127.0.0.1");
      return listeningUrl;
    },
    async close() {
      if (closed) return;
      closed = true;
      routines.stop();
      files.stop();
      initiative.stop();
      await engine.shutdown();
      await mcp.shutdown();
      codexAccount.shutdown();
      claudeAccount.shutdown();
      await browser.shutdown();
      await computer.shutdown();
      await app.close();
      db.close();
    },
  };
  return hub;
}
