import type { Author, Card, Conversation, ItemKind, TimelineEvent, TimelineItem } from "@orbis/shared";
import { all, get, json, run, type Database, type Row } from "../db/index.js";

function toConversation(r: Row, members: string[]): Conversation {
  return {
    id: r.id as string,
    kind: r.kind as Conversation["kind"],
    title: r.title as string,
    members,
    leadBotId: (r.lead_bot_id as string | null) ?? null,
    createdAt: r.created_at as string,
    lastItemAt: (r.last_item_at as string | null) ?? null,
  };
}

/** Reactions are stored per actor and exposed as counts. */
type ReactionStore = Record<string, string[]>;

function toItem(r: Row): TimelineItem {
  const reactions = json<ReactionStore>(r.reactions, {});
  const item: TimelineItem = {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    kind: r.kind as ItemKind,
    author: { type: r.author_type as Author["type"], id: (r.author_id as string | null) ?? null },
    text: r.text as string,
    parentId: (r.parent_id as string | null) ?? null,
    mentions: json<string[]>(r.mentions, []),
    attachments: json<string[]>(r.attachments, []),
    reactions: Object.fromEntries(Object.entries(reactions).map(([emoji, actors]) => [emoji, actors.length])),
    runId: (r.run_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
  const card = json<Card | null>(r.card, null);
  if (card) item.card = card;
  const event = json<TimelineEvent | null>(r.event, null);
  if (event) item.event = event;
  return item;
}

export class ConversationsRepo {
  constructor(private readonly db: Database) {}

  private members(conversationId: string): string[] {
    return all<{ bot_id: string }>(
      this.db,
      "SELECT bot_id FROM conversation_members WHERE conversation_id = ? ORDER BY position",
      conversationId,
    ).map((r) => r.bot_id);
  }

  get(id: string): Conversation | undefined {
    const row = get(this.db, "SELECT * FROM conversations WHERE id = ?", id);
    return row ? toConversation(row, this.members(id)) : undefined;
  }

  getDirect(botId: string): Conversation | undefined {
    const row = get(this.db, "SELECT * FROM conversations WHERE direct_bot_id = ?", botId);
    return row ? toConversation(row, this.members(row.id as string)) : undefined;
  }

  list(): Conversation[] {
    return all(
      this.db,
      "SELECT * FROM conversations ORDER BY (last_item_at IS NULL) ASC, last_item_at DESC, created_at DESC",
    ).map((r) => toConversation(r, this.members(r.id as string)));
  }

  /** Conversations a bot belongs to. */
  forBot(botId: string): Conversation[] {
    return all(
      this.db,
      `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.bot_id = ? ORDER BY c.created_at`,
      botId,
    ).map((r) => toConversation(r, this.members(r.id as string)));
  }

  insert(conv: Conversation, directBotId: string | null): void {
    run(
      this.db,
      `INSERT INTO conversations (id, kind, title, lead_bot_id, direct_bot_id, created_at, last_item_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      conv.id,
      conv.kind,
      conv.title,
      conv.leadBotId,
      directBotId,
      conv.createdAt,
      conv.lastItemAt,
    );
    conv.members.forEach((botId, position) => this.addMember(conv.id, botId, position));
  }

  addMember(conversationId: string, botId: string, position?: number): void {
    const pos =
      position ??
      Number(
        get<{ n: number }>(
          this.db,
          "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM conversation_members WHERE conversation_id = ?",
          conversationId,
        )!.n,
      );
    run(
      this.db,
      "INSERT INTO conversation_members (conversation_id, bot_id, position) VALUES (?, ?, ?)",
      conversationId,
      botId,
      pos,
    );
  }

  removeMember(conversationId: string, botId: string): void {
    run(this.db, "DELETE FROM conversation_members WHERE conversation_id = ? AND bot_id = ?", conversationId, botId);
  }

  update(id: string, patch: { title?: string; leadBotId?: string | null }): void {
    if (patch.title !== undefined) run(this.db, "UPDATE conversations SET title = ? WHERE id = ?", patch.title, id);
    if (patch.leadBotId !== undefined) {
      run(this.db, "UPDATE conversations SET lead_bot_id = ? WHERE id = ?", patch.leadBotId, id);
    }
  }

  clearLead(botId: string): void {
    run(this.db, "UPDATE conversations SET lead_bot_id = NULL WHERE lead_bot_id = ?", botId);
  }

  touch(id: string, at: string): void {
    run(this.db, "UPDATE conversations SET last_item_at = ? WHERE id = ?", at, id);
  }

  delete(id: string): void {
    run(this.db, "DELETE FROM conversations WHERE id = ?", id);
  }
}

export interface NewItem {
  id: string;
  conversationId: string;
  kind: ItemKind;
  author: Author;
  text: string;
  parentId?: string | null;
  mentions?: string[];
  attachments?: string[];
  runId?: string | null;
  card?: Card;
  event?: TimelineEvent;
  createdAt: string;
}

export class ItemsRepo {
  constructor(private readonly db: Database) {}

  insert(item: NewItem): TimelineItem {
    run(
      this.db,
      `INSERT INTO items (id, conversation_id, kind, author_type, author_id, text, parent_id, mentions, attachments,
         reactions, run_id, card, event, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`,
      item.id,
      item.conversationId,
      item.kind,
      item.author.type,
      item.author.id,
      item.text,
      item.parentId ?? null,
      JSON.stringify(item.mentions ?? []),
      JSON.stringify(item.attachments ?? []),
      item.runId ?? null,
      item.card ? JSON.stringify(item.card) : null,
      item.event ? JSON.stringify(item.event) : null,
      item.createdAt,
      item.createdAt,
    );
    return this.get(item.id)!;
  }

  get(id: string): TimelineItem | undefined {
    const row = get(this.db, "SELECT * FROM items WHERE id = ?", id);
    return row ? toItem(row) : undefined;
  }

  /** Items in timeline order, the page ending just before `before` when given. */
  list(conversationId: string, opts: { before?: string; limit?: number } = {}): TimelineItem[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    let beforeSeq: number | null = null;
    if (opts.before) {
      const row = get<{ seq: number }>(this.db, "SELECT seq FROM items WHERE id = ?", opts.before);
      beforeSeq = row ? Number(row.seq) : null;
    }
    const rows =
      beforeSeq === null
        ? all(this.db, "SELECT * FROM items WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?", conversationId, limit)
        : all(
            this.db,
            "SELECT * FROM items WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
            conversationId,
            beforeSeq,
            limit,
          );
    return rows.reverse().map(toItem);
  }

  /** Cards of a type still in one of the given states, oldest first. */
  openCards(type: string, states: string[]): TimelineItem[] {
    return all(
      this.db,
      `SELECT * FROM items WHERE kind = 'card' AND json_extract(card, '$.type') = ? AND json_extract(card, '$.state') IN (${states.map(() => "?").join(", ")}) ORDER BY seq`,
      type,
      ...states,
    ).map(toItem);
  }

  /** The cards a run posted (its handoffs), oldest first. */
  cardsOf(runId: string): TimelineItem[] {
    return all(this.db, "SELECT * FROM items WHERE run_id = ? AND kind = 'card' ORDER BY seq ASC", runId).map(toItem);
  }

  /** The bot message a run posted as its reply. */
  replyOf(runId: string): TimelineItem | undefined {
    const row = get(
      this.db,
      "SELECT * FROM items WHERE run_id = ? AND kind = 'message' AND author_type = 'bot' ORDER BY seq DESC LIMIT 1",
      runId,
    );
    return row ? toItem(row) : undefined;
  }

  setCard(id: string, card: Card, at: string): TimelineItem {
    run(this.db, "UPDATE items SET card = ?, updated_at = ? WHERE id = ?", JSON.stringify(card), at, id);
    return this.get(id)!;
  }

  setText(id: string, text: string, at: string): TimelineItem {
    run(this.db, "UPDATE items SET text = ?, updated_at = ? WHERE id = ?", text, at, id);
    return this.get(id)!;
  }

  /** Add or remove one actor's reaction; returns the updated item. */
  react(id: string, emoji: string, actor: string, add: boolean, at: string): TimelineItem {
    const row = get(this.db, "SELECT reactions FROM items WHERE id = ?", id);
    const store = json<ReactionStore>(row?.reactions, {});
    const actors = new Set(store[emoji] ?? []);
    if (add) actors.add(actor);
    else actors.delete(actor);
    if (actors.size === 0) delete store[emoji];
    else store[emoji] = [...actors];
    run(this.db, "UPDATE items SET reactions = ?, updated_at = ? WHERE id = ?", JSON.stringify(store), at, id);
    return this.get(id)!;
  }
}
