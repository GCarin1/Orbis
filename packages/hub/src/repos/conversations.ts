import type { Author, Card, Conversation, ConversationFile, ConversationLink, ItemKind, TimelineEvent, TimelineItem } from "@orbis/shared";
import { all, get, json, run, type Database, type Row } from "../db/index.js";

function toConversation(r: Row, members: string[]): Conversation {
  return {
    id: r.id as string,
    kind: r.kind as Conversation["kind"],
    title: r.title as string,
    members,
    leadBotId: (r.lead_bot_id as string | null) ?? null,
    description: (r.description as string | null) ?? "",
    photo: (r.photo as string | null) ?? null,
    muted: Number(r.muted ?? 0) === 1,
    createdAt: r.created_at as string,
    lastItemAt: (r.last_item_at as string | null) ?? null,
  };
}

/** What a group's info can change. */
export interface GroupChanges {
  title?: string;
  leadBotId?: string | null;
  description?: string;
  photo?: string | null;
  muted?: boolean;
}

/** An http(s) address in text; a closing bracket, quote or angle ends it (Markdown links included). */
const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"'`]+/g;

/** Text compared without case or accents. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Reactions are stored per actor and exposed as counts. */
type ReactionStore = Record<string, string[]>;

export function toFile(r: Row): ConversationFile {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    name: r.name as string,
    mime: r.mime as string,
    size: Number(r.size),
    author: { type: r.author_type as Author["type"], id: (r.author_id as string | null) ?? null },
    itemId: (r.item_id as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** The files an item carries, in the order it names them (a file gone from the store is left out). */
function filesOf(db: Database, ids: string[]): ConversationFile[] {
  if (!ids.length) return [];
  const rows = all(db, `SELECT * FROM files WHERE id IN (${ids.map(() => "?").join(", ")})`, ...ids);
  const byId = new Map(rows.map((r) => [r.id as string, toFile(r)]));
  return ids.map((id) => byId.get(id)).filter((f): f is ConversationFile => f !== undefined);
}

function toItem(r: Row, db?: Database): TimelineItem {
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
  if (db && item.attachments.length) item.files = filesOf(db, item.attachments);
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
      `INSERT INTO conversations (id, kind, title, lead_bot_id, direct_bot_id, created_at, last_item_at, description, photo, muted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      conv.id,
      conv.kind,
      conv.title,
      conv.leadBotId,
      directBotId,
      conv.createdAt,
      conv.lastItemAt,
      conv.description ?? "",
      conv.photo ?? null,
      conv.muted ? 1 : 0,
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

  update(id: string, patch: GroupChanges): void {
    if (patch.title !== undefined) run(this.db, "UPDATE conversations SET title = ? WHERE id = ?", patch.title, id);
    if (patch.description !== undefined) run(this.db, "UPDATE conversations SET description = ? WHERE id = ?", patch.description, id);
    if (patch.photo !== undefined) run(this.db, "UPDATE conversations SET photo = ? WHERE id = ?", patch.photo, id);
    if (patch.muted !== undefined) run(this.db, "UPDATE conversations SET muted = ? WHERE id = ?", patch.muted ? 1 : 0, id);
    if (patch.leadBotId !== undefined) {
      run(this.db, "UPDATE conversations SET lead_bot_id = ? WHERE id = ?", patch.leadBotId, id);
    }
  }

  /** The groups a bot is a member of. */
  groupsOf(botId: string): string[] {
    return all<{ id: string }>(
      this.db,
      "SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE c.kind = 'group' AND m.bot_id = ?",
      botId,
    ).map((r) => r.id);
  }

  /** A cleared conversation has no last item. */
  resetLastItem(id: string): void {
    run(this.db, "UPDATE conversations SET last_item_at = NULL WHERE id = ?", id);
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
    return row ? toItem(row, this.db) : undefined;
  }

  /** Items in timeline order, the page ending just before `before` when given. */
  /** Delete every item of a conversation (clearing it). */
  deleteConversation(conversationId: string): void {
    run(this.db, "DELETE FROM items WHERE conversation_id = ?", conversationId);
  }

  /** The newest join or leave of a bot in a conversation, or null when there is none. */
  lastMembership(conversationId: string, botId: string): "member.joined" | "member.left" | null {
    const row = get<{ type: string }>(
      this.db,
      `SELECT json_extract(event, '$.type') AS type FROM items
       WHERE conversation_id = ? AND kind = 'event' AND json_extract(event, '$.data.botId') = ?
         AND json_extract(event, '$.type') IN ('member.joined', 'member.left')
       ORDER BY seq DESC LIMIT 1`,
      conversationId,
      botId,
    );
    return (row?.type as "member.joined" | "member.left" | undefined) ?? null;
  }

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
    return rows.reverse().map((r) => toItem(r, this.db));
  }

  /** Messages whose text holds `query`, ignoring case and accents ("acao" finds "Ação"), newest first. */
  search(conversationId: string, query: string, limit = 50): TimelineItem[] {
    const needle = fold(query.trim());
    if (!needle) return [];
    const found: TimelineItem[] = [];
    for (const row of all(this.db, "SELECT * FROM items WHERE conversation_id = ? AND kind = 'message' ORDER BY seq DESC", conversationId)) {
      if (!fold(String(row.text)).includes(needle)) continue;
      found.push(toItem(row, this.db));
      if (found.length >= limit) break;
    }
    return found;
  }

  /** The links written in a conversation's messages, each once (where it was last written), newest first. */
  links(conversationId: string, limit = 200): ConversationLink[] {
    const rows = all(
      this.db,
      "SELECT id, author_type, author_id, text, created_at FROM items WHERE conversation_id = ? AND kind = 'message' AND instr(text, '://') > 0 ORDER BY seq DESC",
      conversationId,
    );
    const links: ConversationLink[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const match of String(row.text).matchAll(URL_IN_TEXT)) {
        const url = match[0].replace(/[.,;:!?*_]+$/, "");
        if (seen.has(url)) continue;
        seen.add(url);
        links.push({ url, itemId: row.id as string, author: { type: row.author_type as Author["type"], id: (row.author_id as string | null) ?? null }, createdAt: row.created_at as string });
        if (links.length >= limit) return links;
      }
    }
    return links;
  }

  /** Cards of a type still in one of the given states, oldest first. */
  openCards(type: string, states: string[]): TimelineItem[] {
    return all(
      this.db,
      `SELECT * FROM items WHERE kind = 'card' AND json_extract(card, '$.type') = ? AND json_extract(card, '$.state') IN (${states.map(() => "?").join(", ")}) ORDER BY seq`,
      type,
      ...states,
    ).map((r) => toItem(r, this.db));
  }

  /** The cards a run posted (its handoffs), oldest first. */
  cardsOf(runId: string): TimelineItem[] {
    return all(this.db, "SELECT * FROM items WHERE run_id = ? AND kind = 'card' ORDER BY seq ASC", runId).map((r) => toItem(r, this.db));
  }

  /** The bot message a run posted as its reply. */
  replyOf(runId: string): TimelineItem | undefined {
    const row = get(
      this.db,
      "SELECT * FROM items WHERE run_id = ? AND kind = 'message' AND author_type = 'bot' ORDER BY seq DESC LIMIT 1",
      runId,
    );
    return row ? toItem(row, this.db) : undefined;
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
