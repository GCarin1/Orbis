// createHub: wire configuration, database, repositories, services, the run
// engine and the HTTP surface into one hub (specs/hub-api).
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { timingSafeEqual } from "node:crypto";
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
import { SkillService } from "./skills/service.js";
import { RoutineService } from "./routines/service.js";
import { openDatabase, type Database } from "./db/index.js";
import { HttpError, unauthorized } from "./errors.js";
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
import { openaiBrain } from "./brains/openai.js";
import { codexBrain } from "./brains/codex.js";
import { geminiBrain } from "./brains/gemini.js";
import { runtimeHealth } from "./brains/health.js";
import { registerOpenAiCompat } from "./api/openai-compat.js";
import { registerGroupRoutes } from "./api/groups-routes.js";
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
import { SecretResolvers, type HubContext } from "./context.js";

export interface HubOptions {
  env?: Env;
  config?: ConfigOverrides;
  /** Computer providers replacing the built-in ones of the same kind (tests pass a recorded docker), or extra ones. */
  computerProviders?: ComputerProvider[];
  /** Replace or add brain adapters (tests register fakes here). */
  brains?: BrainAdapter[];
  /** Fastify request logging; off by default. */
  logger?: boolean;
  /** The clock routines schedule by (tests drive time with it). */
  clock?: () => Date;
}

export interface Hub extends HubContext {
  app: FastifyInstance;
  skills: SkillService;
  routines: RoutineService;
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

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}

/** Paths that carry their own authentication or none (health, webhooks, MCP run tokens, static files). */
function needsHubToken(url: string): "bearer" | "query" | null {
  const p = url.split("?")[0]!;
  if (p === "/api/v1/stream") return "query";
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
  for (const adapter of [mockBrain, anthropicBrain, openaiBrain, claudeCodeBrain, codexBrain, geminiBrain, customCliBrain]) {
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
  });

  const approvals = new ApprovalService({ repo: repos.approvals, bus, timeline, engine, botService });
  const drafts = new DraftService(repos.items, timeline, config.dataDir);
  const tools = new ToolRegistry();
  let listeningUrl: string | null = null;
  const url = () => listeningUrl ?? `http://${config.host}:${config.port}`;
  const gateway = new ToolGateway(tools, approvals, url);
  engine.setToolHost(gateway);

  // Runs left "running" by a previous process cannot resume: close them honestly.
  for (const run of repos.runs.list({ status: "running", limit: 500 })) {
    repos.runs.setStatus(run.id, "failed", { finishedAt: new Date().toISOString(), error: "the hub stopped during this run" });
  }
  for (const run of repos.runs.list({ status: "queued", limit: 500 })) {
    repos.runs.setStatus(run.id, "cancelled", { finishedAt: new Date().toISOString(), error: "the hub stopped before this run started" });
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
  app.addHook("onRequest", async (req) => {
    const mode = needsHubToken(req.url);
    if (!mode) return;
    // noVNC pages inside an iframe authenticate with their path-scoped cookie.
    if (vncSessions.allows(req.url, req.headers.cookie)) return;
    // Any authenticated change is user activity (routines pause after a long absence).
    const presented = mode === "bearer" ? bearer(req) : (new URL(req.url, "http://x").searchParams.get("token") ?? bearer(req));
    if (!presented || !safeEqual(presented, config.token)) throw unauthorized();
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
  const memoryService = new MemoryService(ctx);
  for (const tool of memoryService.tools()) tools.register(tool);
  engine.addHooks(memoryService.hooks());
  for (const tool of computerTools(computer, browser)) tools.register(tool);
  const skillService = new SkillService(ctx);
  for (const tool of skillService.tools()) tools.register(tool);
  engine.addHooks(skillService.hooks());
  engine.addContextSection((bot) => skillService.contextSection(bot));
  conversationService.setSkillResolver((bot, text) => skillService.resolve(bot, text));
  const routines = new RoutineService(ctx, drafts, opts.clock);
  for (const tool of routines.tools()) tools.register(tool);
  engine.addHooks(routines.hooks());
  gateway.onBeforeCall(routines.draftOnlyHook());
  routines.start();
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
  await memoryService.routes(app);
  await registerComputerRoutes(app, ctx, browser, vncSessions);
  await skillService.routes(app);
  await routines.routes(app);
  app.get("/api/v1/runtimes/health", { schema: { tags: ["runtimes"] } }, async () => runtimeHealth());
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
    skills: skillService,
    routines,
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
      await engine.shutdown();
      await browser.shutdown();
      await computer.shutdown();
      await app.close();
      db.close();
    },
  };
  return hub;
}
