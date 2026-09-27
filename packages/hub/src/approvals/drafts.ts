// Drafts: an outbound message exists only as a card until the user presses Send.
import { appendFileSync } from "node:fs";
import path from "node:path";
import type { Bot, DraftFields, Run, TimelineItem } from "@orbis/shared";
import { badRequest, conflict, notFound } from "../errors.js";
import { nowIso } from "../ids.js";
import type { ItemsRepo } from "../repos/conversations.js";
import type { Timeline } from "../services/timeline.js";

export interface DraftDelivery {
  channel: DraftFields["channel"];
  at: string;
  ok: boolean;
  detail: string;
}

export class DraftService {
  constructor(
    private readonly items: ItemsRepo,
    private readonly timeline: Timeline,
    private readonly dataDir: string,
  ) {}

  /** Put a draft card in the run's conversation. Nothing is delivered. */
  create(run: Run, bot: Bot, fields: DraftFields): TimelineItem {
    if (!run.conversationId) throw badRequest("a draft needs a conversation to show its card");
    if (fields.channel === "webhook" && !/^https?:\/\//.test(fields.url ?? "")) {
      throw badRequest("a webhook draft needs an http(s) url", { url: "required for channel webhook" });
    }
    return this.timeline.post({
      conversationId: run.conversationId,
      kind: "card",
      author: { type: "bot", id: bot.id },
      text: `${bot.name} drafted ${fields.channel === "email" ? "an email" : `a ${fields.channel} message`} to ${fields.to}`,
      runId: run.id,
      card: { type: "draft", state: "pending", data: { ...fields, botId: bot.id } },
    });
  }

  private draft(itemId: string): { item: TimelineItem; fields: DraftFields & { botId: string } } {
    const item = this.items.get(itemId);
    if (!item || item.card?.type !== "draft") throw notFound(`draft ${itemId}`);
    return { item, fields: item.card.data as unknown as DraftFields & { botId: string } };
  }

  /** Deliver the draft as edited by the user, and record the result on the card. */
  async send(itemId: string, edits: Partial<Pick<DraftFields, "to" | "subject" | "body" | "url">> = {}): Promise<TimelineItem> {
    const { item, fields } = this.draft(itemId);
    if (item.card!.state !== "pending" && item.card!.state !== "failed") {
      throw conflict("draft_closed", `draft ${itemId} is already ${item.card!.state}`);
    }
    const final = { ...fields, ...Object.fromEntries(Object.entries(edits).filter(([, v]) => v !== undefined)) } as DraftFields & { botId: string };
    const delivery = await this.deliver(final);
    return this.timeline.setCard(itemId, {
      type: "draft",
      state: delivery.ok ? "sent" : "failed",
      data: { ...final, delivery },
    });
  }

  discard(itemId: string): TimelineItem {
    const { item, fields } = this.draft(itemId);
    if (item.card!.state !== "pending" && item.card!.state !== "failed") {
      throw conflict("draft_closed", `draft ${itemId} is already ${item.card!.state}`);
    }
    return this.timeline.setCard(itemId, { type: "draft", state: "discarded", data: { ...fields } });
  }

  private async deliver(fields: DraftFields & { botId: string }): Promise<DraftDelivery> {
    const at = nowIso();
    if (fields.channel === "webhook") {
      try {
        const res = await fetch(fields.url!, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "orbis" },
          body: JSON.stringify({ channel: fields.channel, to: fields.to, subject: fields.subject ?? null, body: fields.body, botId: fields.botId, sentAt: at }),
          signal: AbortSignal.timeout(15_000),
        });
        return { channel: "webhook", at, ok: res.ok, detail: `HTTP ${res.status}` };
      } catch (err) {
        return { channel: "webhook", at, ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    }
    const file = path.join(this.dataDir, "outbox.jsonl");
    appendFileSync(file, JSON.stringify({ ...fields, sentAt: at }) + "\n", { mode: 0o600 });
    return { channel: fields.channel, at, ok: true, detail: `saved to ${file}` };
  }
}
