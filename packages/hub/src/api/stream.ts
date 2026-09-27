// The WebSocket stream of contracts/hub-surface § Stream.
import type { FastifyInstance } from "fastify";
import { GLOBAL_EVENTS, eventConversationId, type ClientMessage, type StreamEvent } from "@orbis/shared";
import type { HubContext } from "../context.js";

/** Whether a subscriber with this filter receives the event (null = every event). */
export function matchesFilter(event: StreamEvent, conversations: Set<string> | null): boolean {
  if (conversations === null) return true;
  if (GLOBAL_EVENTS.includes(event.type)) return true;
  const conversationId = eventConversationId(event);
  return conversationId !== null && conversations.has(conversationId);
}

export async function registerStream(app: FastifyInstance, ctx: HubContext): Promise<void> {
  app.get("/api/v1/stream", { websocket: true, schema: { hide: true } }, (socket) => {
    let filter: Set<string> | null = null;

    const unsubscribe = ctx.bus.subscribe((event) => {
      if (socket.readyState !== socket.OPEN) return;
      if (!matchesFilter(event, filter)) return;
      socket.send(JSON.stringify(event));
    });

    socket.on("message", (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === "subscribe") {
        filter = Array.isArray(msg.conversations) ? new Set(msg.conversations) : null;
        socket.send(JSON.stringify({ type: "subscribed", data: { conversations: msg.conversations ?? null }, ts: new Date().toISOString() }));
      } else if (msg.type === "ping") {
        socket.send(JSON.stringify({ type: "pong", data: {}, ts: new Date().toISOString() }));
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
