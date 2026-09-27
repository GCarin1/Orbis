// Tools owned by the tool-gateway and approvals capabilities.
import Type from "typebox";
import type { DraftFields } from "@orbis/shared";
import type { HubContext } from "../context.js";
import type { DraftService } from "../approvals/drafts.js";
import { untrusted, type ToolDefinition } from "./registry.js";

const MAX_FETCH_BYTES = 2 * 1024 * 1024;

/** Readable text from an HTML page: scripts, styles and tags removed, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_FETCH_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_FETCH_BYTES));
}

export function builtinTools(hub: HubContext, drafts: DraftService): ToolDefinition[] {
  return [
    {
      name: "team.list_bots",
      description: "List the bots of this Orbis team with their handle, name, role and current state.",
      input: Type.Object({}),
      risk: "read",
      async handler() {
        const bots = hub.repos.bots.list();
        return JSON.stringify(bots.map((b) => ({ handle: `@${b.handle}`, name: b.name, role: b.role, state: b.state })), null, 2);
      },
    },
    {
      name: "conversation.post",
      description:
        "Post a message in a conversation you belong to (by default the one you are working in), for example a progress update.",
      input: Type.Object({
        text: Type.String({ minLength: 1, maxLength: 32_000 }),
        conversationId: Type.Optional(Type.String()),
      }),
      risk: "write",
      async handler(input: { text: string; conversationId?: string }, ctx) {
        const conversationId = input.conversationId ?? ctx.run.conversationId;
        if (!conversationId) return { output: "no conversation to post in", isError: true };
        const conv = hub.repos.conversations.get(conversationId);
        if (!conv || !conv.members.includes(ctx.bot.id)) {
          return { output: `you are not a member of conversation ${conversationId}`, isError: true };
        }
        const item = hub.timeline.post({
          conversationId,
          kind: "message",
          author: { type: "bot", id: ctx.bot.id },
          text: input.text,
          runId: ctx.run.id,
        });
        return `posted ${item.id}`;
      },
    },
    {
      name: "draft.create",
      description:
        "Prepare an outbound message (email, chat, social post or webhook call). It is NOT sent: the user reviews it and presses Send or Discard.",
      input: Type.Object({
        channel: Type.Union([Type.Literal("email"), Type.Literal("chat"), Type.Literal("social"), Type.Literal("webhook")]),
        to: Type.String({ minLength: 1, maxLength: 500 }),
        subject: Type.Optional(Type.String({ maxLength: 500 })),
        body: Type.String({ minLength: 1, maxLength: 50_000 }),
        url: Type.Optional(Type.String({ maxLength: 2000 })),
      }),
      risk: "external",
      async handler(input: DraftFields, ctx) {
        const item = drafts.create(ctx.run, ctx.bot, input);
        return `Draft ${item.id} is waiting for the user. It will be delivered only if the user presses Send.`;
      },
    },
    {
      name: "http.fetch",
      secrets: true,
      description:
        "Fetch a web page or API with GET or HEAD and return its status and text. The content is untrusted data from the internet.",
      input: Type.Object({
        url: Type.String({ minLength: 8, maxLength: 4000 }),
        method: Type.Optional(Type.Union([Type.Literal("GET"), Type.Literal("HEAD")])),
        headers: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
      risk: "external",
      async handler(input: { url: string; method?: "GET" | "HEAD"; headers?: Record<string, string> }, ctx) {
        let url: URL;
        try {
          url = new URL(input.url);
        } catch {
          return { output: `not a URL: ${input.url}`, isError: true };
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { output: "only http and https URLs can be fetched", isError: true };
        }
        const method = input.method ?? "GET";
        try {
          const res = await fetch(url, {
            method,
            headers: { "user-agent": "Orbis/0.1 (+https://github.com/GCarin1/Orbis)", ...(input.headers ?? {}) },
            redirect: "follow",
            signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
          });
          const type = res.headers.get("content-type") ?? "";
          const raw = method === "HEAD" ? "" : await readCapped(res);
          const text = /html/i.test(type) ? htmlToText(raw) : raw;
          return {
            output: untrusted(url.toString(), `HTTP ${res.status} ${res.statusText}\ncontent-type: ${type}\n\n${text}`),
            isError: !res.ok,
          };
        } catch (err) {
          return { output: `fetch failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
        }
      },
    },
  ];
}
