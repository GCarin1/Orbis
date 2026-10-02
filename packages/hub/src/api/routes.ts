// REST routes of contracts/hub-surface § REST routes (prefix /api/v1).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { HubContext } from "../context.js";
import { notFound } from "../errors.js";
import {
  CreateBotBody,
  IdParams,
  ItemsQuery,
  ListBotsQuery,
  PatchBotBody,
  PostMessageBody,
  ReactionBody,
  ReactionParams,
  RunsQuery,
} from "./schemas.js";

export async function registerCoreRoutes(root: FastifyInstance, ctx: HubContext): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();
  const { botService, conversationService, engine, repos } = ctx;

  // --- bots ------------------------------------------------------------------
  app.get("/api/v1/bots", { schema: { tags: ["bots"], querystring: ListBotsQuery } }, async (req) =>
    botService.list(req.query.includeHidden ?? false),
  );

  app.post("/api/v1/bots", { schema: { tags: ["bots"], body: CreateBotBody } }, async (req, reply) => {
    reply.code(201);
    return botService.create(req.body);
  });

  app.get("/api/v1/bots/:id", { schema: { tags: ["bots"], params: IdParams } }, async (req) =>
    botService.get(req.params.id),
  );

  app.patch("/api/v1/bots/:id", { schema: { tags: ["bots"], params: IdParams, body: PatchBotBody } }, async (req) =>
    botService.update(req.params.id, req.body),
  );

  app.delete("/api/v1/bots/:id", { schema: { tags: ["bots"], params: IdParams } }, async (req, reply) => {
    await botService.delete(req.params.id);
    reply.code(204);
    return null;
  });

  app.post("/api/v1/bots/:id/duplicate", { schema: { tags: ["bots"], params: IdParams } }, async (req, reply) => {
    reply.code(201);
    return botService.duplicate(req.params.id);
  });

  app.get("/api/v1/bots/:id/conversation", { schema: { tags: ["conversations"], params: IdParams } }, async (req) =>
    conversationService.directFor(req.params.id),
  );

  // --- conversations ---------------------------------------------------------
  app.get("/api/v1/conversations", { schema: { tags: ["conversations"] } }, async () => conversationService.list());

  app.get("/api/v1/conversations/:id", { schema: { tags: ["conversations"], params: IdParams } }, async (req) =>
    conversationService.get(req.params.id),
  );

  app.get(
    "/api/v1/conversations/:id/items",
    { schema: { tags: ["conversations"], params: IdParams, querystring: ItemsQuery } },
    async (req) => conversationService.items(req.params.id, req.query),
  );

  app.post(
    "/api/v1/conversations/:id/messages",
    { schema: { tags: ["conversations"], params: IdParams, body: PostMessageBody } },
    async (req, reply) => {
      reply.code(201);
      return conversationService.postUserMessage(req.params.id, req.body);
    },
  );

  app.post("/api/v1/conversations/:id/read", { schema: { tags: ["conversations"], params: IdParams } }, async (req, reply) => {
    conversationService.markRead(req.params.id);
    reply.code(204);
    return null;
  });

  app.post(
    "/api/v1/items/:id/reactions",
    { schema: { tags: ["conversations"], params: IdParams, body: ReactionBody } },
    async (req) => conversationService.react(req.params.id, req.body.emoji, true),
  );

  app.delete(
    "/api/v1/items/:id/reactions/:emoji",
    { schema: { tags: ["conversations"], params: ReactionParams } },
    async (req) => conversationService.react(req.params.id, req.params.emoji, false),
  );

  // --- runs ------------------------------------------------------------------
  app.get("/api/v1/runs", { schema: { tags: ["runs"], querystring: RunsQuery } }, async (req) =>
    repos.runs.list(req.query),
  );

  app.get("/api/v1/runs/:id", { schema: { tags: ["runs"], params: IdParams } }, async (req) => {
    const run = repos.runs.get(req.params.id);
    if (!run) throw notFound(`run ${req.params.id}`);
    return run;
  });

  app.post("/api/v1/runs/:id/cancel", { schema: { tags: ["runs"], params: IdParams } }, async (req) => {
    if (!repos.runs.get(req.params.id)) throw notFound(`run ${req.params.id}`);
    return { cancelled: engine.cancel(req.params.id) };
  });

  app.post("/api/v1/runs/:id/retry", { schema: { tags: ["runs"], params: IdParams } }, async (req, reply) => {
    reply.code(201);
    return conversationService.retry(req.params.id);
  });
}
