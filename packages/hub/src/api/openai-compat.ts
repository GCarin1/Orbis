// OpenAI-compatible endpoints, so any OpenAI client can talk to a bot (specs/hub-api).
import type { FastifyInstance, FastifyReply } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Run } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { newId } from "../ids.js";

const ContentPart = Type.Object({ type: Type.String(), text: Type.Optional(Type.String()) });
const ChatBody = Type.Object({
  model: Type.String({ minLength: 1 }),
  messages: Type.Array(
    Type.Object({
      role: Type.String(),
      content: Type.Union([Type.String(), Type.Array(ContentPart), Type.Null()]),
    }),
    { minItems: 1 },
  ),
  stream: Type.Optional(Type.Boolean()),
});

const openaiError = (reply: FastifyReply, status: number, message: string, code: string) =>
  reply.code(status).send({ error: { message, type: status === 404 ? "invalid_request_error" : "server_error", code } });

function textOf(content: string | Array<{ type: string; text?: string }> | null): string {
  if (content === null) return "";
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n");
}

export async function registerOpenAiCompat(root: FastifyInstance, ctx: HubContext): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();

  app.get("/v1/models", { schema: { tags: ["openai"] } }, async () => ({
    object: "list",
    data: ctx.botService.list().map((b) => ({
      id: `orbis:${b.handle}`,
      object: "model",
      created: Math.floor(new Date(b.createdAt).getTime() / 1000),
      owned_by: "orbis",
    })),
  }));

  app.post("/v1/chat/completions", { schema: { tags: ["openai"], body: ChatBody } }, async (req, reply) => {
    const handle = /^orbis:(.+)$/.exec(req.body.model)?.[1];
    const bot = handle ? ctx.repos.bots.get(handle) : undefined;
    if (!bot) return openaiError(reply, 404, `The model '${req.body.model}' does not exist; use orbis:<bot handle>`, "model_not_found");
    const lastUser = [...req.body.messages].reverse().find((m) => m.role === "user");
    const text = lastUser ? textOf(lastUser.content).trim() : "";
    if (!text) return openaiError(reply, 400, "the request has no user message with text", "invalid_request");

    const conversation = ctx.conversationService.directFor(bot.id);
    const { runs } = ctx.conversationService.postUserMessage(conversation.id, { text });
    // A `/skill` the bot is not offered starts no run.
    if (!runs[0]) return openaiError(reply, 400, `@${bot.handle} did not start a run for this message (a /skill it is not offered?)`, "no_run");
    const runId = runs[0].id;
    const id = `chatcmpl-${newId("oai").slice(4)}`;
    const created = Math.floor(Date.now() / 1000);
    const model = req.body.model;

    if (!req.body.stream) {
      const run: Run = await ctx.engine.wait(runId);
      if (run.status !== "done") return openaiError(reply, 502, `the bot's run ${run.status}: ${run.error ?? ""}`.trim(), "run_failed");
      return {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [{ index: 0, message: { role: "assistant", content: run.reply ?? "" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: run.usage.inputTokens,
          completion_tokens: run.usage.outputTokens,
          total_tokens: run.usage.inputTokens + run.usage.outputTokens,
        },
      };
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    send(chunk({ role: "assistant", content: "" }));
    // Keep proxies and clients from timing out while the bot works.
    const keepAlive = setInterval(() => res.write(": working\n\n"), 10_000);
    try {
      const run = await ctx.engine.wait(runId);
      if (run.status === "done") {
        send(chunk({ content: run.reply ?? "" }));
        send(chunk({}, "stop"));
      } else {
        send({ error: { message: `the bot's run ${run.status}: ${run.error ?? ""}`.trim(), type: "server_error", code: "run_failed" } });
      }
    } finally {
      clearInterval(keepAlive);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });
}
