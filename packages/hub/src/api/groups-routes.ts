// Group conversations (contracts/hub-surface § REST routes).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { HubContext } from "../context.js";
import { IdParams } from "./schemas.js";

const GroupBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 120 }),
    members: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 64 }),
    leadBotId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);
const GroupPatch = Type.Object(
  { title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })), leadBotId: Type.Optional(Type.Union([Type.String(), Type.Null()])) },
  { additionalProperties: false },
);
const MemberBody = Type.Object({ botId: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const MemberParams = Type.Object({ id: Type.String(), botId: Type.String() });

export async function registerGroupRoutes(root: FastifyInstance, ctx: HubContext): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();
  const svc = ctx.conversationService;

  app.post("/api/v1/conversations", { schema: { tags: ["conversations"], body: GroupBody } }, async (req, reply) => {
    reply.code(201);
    return svc.createGroup(req.body);
  });
  app.patch("/api/v1/conversations/:id", { schema: { tags: ["conversations"], params: IdParams, body: GroupPatch } }, async (req) =>
    svc.updateGroup(req.params.id, req.body),
  );
  app.delete("/api/v1/conversations/:id", { schema: { tags: ["conversations"], params: IdParams } }, async (req, reply) => {
    svc.deleteGroup(req.params.id);
    reply.code(204);
    return null;
  });
  // Clear a conversation (direct or group): its items, the bots' sessions of it and its run summaries.
  app.delete("/api/v1/conversations/:id/items", { schema: { tags: ["conversations"], params: IdParams } }, async (req) => svc.clear(req.params.id));
  app.post("/api/v1/conversations/:id/members", { schema: { tags: ["conversations"], params: IdParams, body: MemberBody } }, async (req) =>
    svc.addMember(req.params.id, req.body.botId),
  );
  app.delete("/api/v1/conversations/:id/members/:botId", { schema: { tags: ["conversations"], params: MemberParams } }, async (req) =>
    svc.removeMember(req.params.id, req.params.botId),
  );
}
