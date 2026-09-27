// Posting to conversation timelines: persist, touch the conversation, broadcast.
import type { Card, TimelineItem } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import { newId, nowIso } from "../ids.js";
import type { BotsRepo } from "../repos/bots.js";
import type { ConversationsRepo, ItemsRepo, NewItem } from "../repos/conversations.js";

export class Timeline {
  constructor(
    private readonly items: ItemsRepo,
    private readonly conversations: ConversationsRepo,
    private readonly bots: BotsRepo,
    private readonly bus: EventBus,
  ) {}

  post(item: Omit<NewItem, "id" | "createdAt"> & { id?: string; createdAt?: string }): TimelineItem {
    const at = item.createdAt ?? nowIso();
    const saved = this.items.insert({ ...item, id: item.id ?? newId("itm"), createdAt: at });
    this.conversations.touch(saved.conversationId, at);
    if (saved.kind === "message") {
      const conv = this.conversations.get(saved.conversationId);
      if (saved.author.type === "bot" && saved.author.id) {
        this.bots.setLastMessage(saved.author.id, saved.text, at);
      } else if (conv?.kind === "direct" && conv.members[0]) {
        this.bots.setLastMessage(conv.members[0], saved.text, at);
      }
    }
    this.bus.publish("timeline.item", { conversationId: saved.conversationId, item: saved });
    return saved;
  }

  /** Post a system event line (run failed, depth exceeded, routine paused, ...). */
  event(conversationId: string, type: string, text: string, data: Record<string, unknown> = {}, runId: string | null = null): TimelineItem {
    return this.post({
      conversationId,
      kind: "event",
      author: { type: "system", id: null },
      text,
      runId,
      event: { type, data },
    });
  }

  setCard(itemId: string, card: Card): TimelineItem {
    const item = this.items.setCard(itemId, card, nowIso());
    this.bus.publish("timeline.item", { conversationId: item.conversationId, item });
    return item;
  }

  react(itemId: string, emoji: string, actor: string, add: boolean): TimelineItem {
    const item = this.items.react(itemId, emoji, actor, add, nowIso());
    this.bus.publish("timeline.item", { conversationId: item.conversationId, item });
    return item;
  }
}
