// Approvals and cards (contracts/hub-surface § REST routes).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { HubContext } from "../context.js";
import { IdParams } from "./schemas.js";

const ApprovalsQuery = Type.Object({
  status: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("approved"), Type.Literal("denied"), Type.Literal("expired")])),
});

const DecisionBody = Type.Object(
  {
    decision: Type.Union([Type.Literal("allow_once"), Type.Literal("allow_always"), Type.Literal("deny")]),
    note: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);

const SendBody = Type.Object(
  {
    fields: Type.Optional(
      Type.Object(
        {
          to: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          subject: Type.Optional(Type.String({ maxLength: 500 })),
          body: Type.Optional(Type.String({ minLength: 1, maxLength: 50_000 })),
          url: Type.Optional(Type.String({ maxLength: 2000 })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export async function registerApprovalRoutes(root: FastifyInstance, ctx: HubContext): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();

  app.get("/api/v1/approvals", { schema: { tags: ["approvals"], querystring: ApprovalsQuery } }, async (req) =>
    ctx.approvals.list(req.query.status),
  );

  app.get("/api/v1/approvals/:id", { schema: { tags: ["approvals"], params: IdParams } }, async (req) =>
    ctx.approvals.get(req.params.id),
  );

  app.post("/api/v1/approvals/:id", { schema: { tags: ["approvals"], params: IdParams, body: DecisionBody } }, async (req) =>
    ctx.approvals.resolve(req.params.id, req.body.decision, req.body.note ?? null),
  );

  app.post("/api/v1/cards/:id/send", { schema: { tags: ["approvals"], params: IdParams, body: SendBody } }, async (req) =>
    ctx.drafts.send(req.params.id, req.body.fields ?? {}),
  );

  app.post("/api/v1/cards/:id/discard", { schema: { tags: ["approvals"], params: IdParams } }, async (req) =>
    ctx.drafts.discard(req.params.id),
  );
}
