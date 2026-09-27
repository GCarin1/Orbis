// Request schemas (TypeBox): one declaration validates, types and documents a route.
import Type from "typebox";
import { BRAIN_KINDS } from "@orbis/shared";

export const IdParams = Type.Object({ id: Type.String({ minLength: 1 }) });

export const BrainSchema = Type.Object(
  {
    kind: Type.Union(BRAIN_KINDS.map((k) => Type.Literal(k))),
    model: Type.Optional(Type.String({ maxLength: 200 })),
    baseUrl: Type.Optional(Type.String({ maxLength: 500 })),
    apiKeySecret: Type.Optional(Type.String({ maxLength: 64 })),
    command: Type.Optional(Type.String({ maxLength: 1000 })),
    args: Type.Optional(Type.Array(Type.String({ maxLength: 4000 }), { maxItems: 64 })),
    maxSteps: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    timeoutSec: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
  },
  { additionalProperties: false },
);

export const PolicySchema = Type.Object(
  {
    rules: Type.Array(
      Type.Object(
        {
          tool: Type.String({ minLength: 1, maxLength: 200 }),
          decision: Type.Union([Type.Literal("allow"), Type.Literal("ask"), Type.Literal("deny")]),
          locked: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
    grants: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 200 }),
  },
  { additionalProperties: false },
);

export const ComputerSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    provider: Type.Optional(Type.Union([Type.Literal("local"), Type.Literal("docker")])),
    image: Type.Optional(Type.String({ maxLength: 300 })),
    cpus: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 64 })),
    memoryMb: Type.Optional(Type.Integer({ minimum: 128, maximum: 262_144 })),
    hibernateAfterMin: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_080 })),
  },
  { additionalProperties: false },
);

const botFields = {
  handle: Type.Optional(Type.String({ maxLength: 64 })),
  role: Type.Optional(Type.String({ maxLength: 120 })),
  description: Type.Optional(Type.String({ maxLength: 20_000 })),
  avatarColor: Type.Optional(Type.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  brain: Type.Optional(BrainSchema),
  policy: Type.Optional(PolicySchema),
  computer: Type.Optional(ComputerSchema),
  skills: Type.Optional(Type.Array(Type.String({ maxLength: 64 }), { maxItems: 200 })),
  spendCapUsd: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  capIncludesSubscription: Type.Optional(Type.Boolean()),
  pinned: Type.Optional(Type.Boolean()),
  hidden: Type.Optional(Type.Boolean()),
};

export const CreateBotBody = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 80 }), ...botFields },
  { additionalProperties: false },
);

export const PatchBotBody = Type.Object(
  { name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })), ...botFields },
  { additionalProperties: false },
);

export const ListBotsQuery = Type.Object({ includeHidden: Type.Optional(Type.Boolean()) });

export const ItemsQuery = Type.Object({
  before: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
});

export const PostMessageBody = Type.Object(
  {
    text: Type.String({ maxLength: 32_000 }),
    parentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    attachments: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 20 })),
  },
  { additionalProperties: false },
);

export const ReactionBody = Type.Object(
  { emoji: Type.String({ minLength: 1, maxLength: 32 }) },
  { additionalProperties: false },
);

export const ReactionParams = Type.Object({ id: Type.String(), emoji: Type.String({ minLength: 1, maxLength: 32 }) });

export const RunsQuery = Type.Object({
  botId: Type.Optional(Type.String()),
  conversationId: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
});

export const StreamQuery = Type.Object({ token: Type.Optional(Type.String()) });
