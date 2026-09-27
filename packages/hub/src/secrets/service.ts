// Secrets for bots (specs/secrets, ADR 0008): the vault wired into the gateway,
// the engine, the timeline and approvals; secret.request cards; REST routes.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { TimelineItem } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { ToolDefinition } from "../tools/registry.js";
import { IdParams } from "../api/schemas.js";
import { hasPlaceholder, loadMasterKey, SECRET_NAME, Vault } from "./vault.js";

type Answer = "fulfilled" | "declined" | "expired";

export class SecretService {
  readonly vault: Vault;
  /** Runs waiting on a secret-request card, by card item id. */
  private readonly waiting = new Map<string, (answer: Answer) => void>();

  constructor(private readonly hub: HubContext) {
    this.vault = new Vault(hub.db, loadMasterKey(hub.config.dataDir, hub.config.masterKey));
  }

  /** Plug the vault into every place a value could leak or be needed. */
  wire(): void {
    const redact = <T>(botId: string, value: T): T => this.vault.redactDeep(botId, value);
    this.hub.secretResolvers.register((botId, name) => this.vault.get(botId, name));
    this.hub.gateway.setSecrets({
      resolve: (botId, input) => this.vault.resolve(botId, input),
      redact: (botId, text) => this.vault.redact(botId, text),
      hasPlaceholder,
    });
    this.hub.engine.setRedactor(redact);
    this.hub.timeline.setRedactor(redact);
    this.hub.approvals.setMask(redact);
  }

  private card(itemId: string): TimelineItem {
    const item = this.hub.repos.items.get(itemId);
    if (!item || item.card?.type !== "secret-request") throw notFound(`secret request ${itemId}`);
    return item;
  }

  /** The user's answer to a secret-request card. The value goes to the vault only. */
  answer(itemId: string, body: { value?: string; decline?: boolean }): TimelineItem {
    const item = this.card(itemId);
    if (item.card!.state !== "pending") throw conflict("card_closed", `this secret request is already ${item.card!.state}`);
    const data = item.card!.data as { name: string; botId: string };
    let state: Answer;
    if (body.decline) state = "declined";
    else {
      if (typeof body.value !== "string" || body.value.length === 0) throw badRequest("invalid request", { value: "required unless decline is true" });
      this.vault.set(data.botId, data.name, body.value);
      state = "fulfilled";
    }
    const updated = this.hub.timeline.setCard(itemId, { type: "secret-request", state, data: { ...data, answeredAt: new Date().toISOString() } });
    this.waiting.get(itemId)?.(state);
    this.waiting.delete(itemId);
    return updated;
  }

  tools(): ToolDefinition[] {
    return [
      {
        name: "secret.request",
        description:
          "Ask the user for a secret you need (an API key, a password, a token). The user types it into a masked form; you never see it. Afterwards use {{secret:NAME}} in the inputs of tools that act (computer.shell, computer.write_file, browser.open, browser.type, http.fetch).",
        input: Type.Object({
          name: Type.String({ pattern: SECRET_NAME.source, description: "e.g. GITHUB_TOKEN" }),
          reason: Type.String({ minLength: 1, maxLength: 500, description: "what you need it for, shown to the user" }),
        }),
        risk: "read",
        handler: async (input: { name: string; reason: string }, ctx) => {
          if (this.vault.get(ctx.bot.id, input.name) !== null) {
            return `{{secret:${input.name}}} is already set for you; use the placeholder in a tool input`;
          }
          const conversationId = ctx.run.conversationId ?? this.hub.conversationService.directFor(ctx.bot.id).id;
          const item = this.hub.timeline.post({
            conversationId,
            kind: "card",
            author: { type: "bot", id: ctx.bot.id },
            text: `${ctx.bot.name} asks for the secret ${input.name}: ${input.reason}`,
            runId: ctx.run.id,
            card: { type: "secret-request", state: "pending", data: { name: input.name, reason: input.reason, botId: ctx.bot.id, runId: ctx.run.id } },
          });
          this.hub.engine.markWaiting(ctx.run.id, true);
          let answer: Answer;
          try {
            answer = await new Promise<Answer>((resolve) => {
              this.waiting.set(item.id, resolve);
              const onAbort = () => resolve("expired");
              if (ctx.signal.aborted) onAbort();
              else ctx.signal.addEventListener("abort", onAbort, { once: true });
            });
          } finally {
            this.waiting.delete(item.id);
            this.hub.engine.markWaiting(ctx.run.id, false);
          }
          if (answer === "expired") {
            if (this.hub.repos.items.get(item.id)?.card?.state === "pending") {
              this.hub.timeline.setCard(item.id, { type: "secret-request", state: "expired", data: item.card!.data });
            }
            return { output: "the run ended before the user answered", isError: true };
          }
          if (answer === "declined") return { output: `the user declined: ${input.name} is unavailable; continue without it or explain what you cannot do`, isError: true };
          return `the user stored ${input.name}; use {{secret:${input.name}}} in the input of a tool that acts — you will never see the value`;
        },
      },
    ];
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const NameParams = Type.Object({ id: Type.String({ minLength: 1 }), name: Type.String({ minLength: 1 }) });
    const ValueBody = Type.Object({ value: Type.String({ minLength: 1, maxLength: 20_000 }) }, { additionalProperties: false });
    const Answer = Type.Object({ value: Type.Optional(Type.String({ minLength: 1, maxLength: 20_000 })), decline: Type.Optional(Type.Boolean()) }, { additionalProperties: false });

    app.get("/api/v1/bots/:id/secrets", { schema: { tags: ["secrets"], params: IdParams } }, async (req) =>
      this.vault.list(this.hub.botService.get(req.params.id).id),
    );
    app.put("/api/v1/bots/:id/secrets/:name", { schema: { tags: ["secrets"], params: NameParams, body: ValueBody } }, async (req) => {
      if (!SECRET_NAME.test(req.params.name)) throw badRequest("invalid secret name", { name: "1 to 64 characters of A-Z, 0-9 and _, starting with a letter" });
      return this.vault.set(this.hub.botService.get(req.params.id).id, req.params.name, req.body.value);
    });
    app.delete("/api/v1/bots/:id/secrets/:name", { schema: { tags: ["secrets"], params: NameParams } }, async (req, reply) => {
      if (!this.vault.delete(this.hub.botService.get(req.params.id).id, req.params.name)) throw notFound(`secret ${req.params.name}`);
      reply.code(204);
      return null;
    });
    // Same parameter name as the draft card routes (one router node for /cards/:id/…).
    app.post("/api/v1/cards/:id/secret", { schema: { tags: ["secrets"], params: IdParams, body: Answer } }, async (req) => this.answer(req.params.id, req.body));
  }
}
