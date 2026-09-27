// Stream events (hub → client) from `.doctrina/contracts/hub-surface.md` § Stream.
import type { Approval, Bot, BotState, Conversation, Run, Step, TimelineItem } from "./types.js";

export interface StreamEventMap {
  "bot.state": { botId: string; state: BotState };
  "bot.updated": { bot: Bot };
  "bot.deleted": { botId: string };
  "conversation.updated": { conversation: Conversation };
  "timeline.item": { conversationId: string; item: TimelineItem };
  "run.updated": { run: Omit<Run, "steps"> };
  "run.step": { runId: string; conversationId: string | null; botId: string; step: Step };
  "approval.requested": { approval: Approval };
  "approval.resolved": { approval: Approval };
  pong: Record<string, never>;
}

export type StreamEventType = keyof StreamEventMap;

export interface StreamEvent<T extends StreamEventType = StreamEventType> {
  type: T;
  data: StreamEventMap[T];
  ts: string;
}

/** Events every subscriber receives, whatever its conversation filter. */
export const GLOBAL_EVENTS: readonly StreamEventType[] = [
  "bot.state",
  "bot.updated",
  "bot.deleted",
  "approval.requested",
  "approval.resolved",
  "pong",
];

/** The conversation an event belongs to, or null for account-wide events. */
export function eventConversationId(event: StreamEvent): string | null {
  const data = event.data as Record<string, unknown>;
  if (typeof data.conversationId === "string") return data.conversationId;
  if (event.type === "conversation.updated") {
    return (data.conversation as Conversation).id;
  }
  if (event.type === "run.updated") {
    return (data.run as Run).conversationId ?? null;
  }
  return null;
}

export type ClientMessage = { type: "subscribe"; conversations?: string[] } | { type: "ping" };
