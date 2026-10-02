import type { MemoryEntry, MemoryKind } from "@orbis/shared";
import { all, get, run, type Database, type Row } from "../db/index.js";

export { MEMORY_KINDS, type MemoryEntry, type MemoryKind } from "@orbis/shared";

function toEntry(r: Row): MemoryEntry {
  return {
    id: r.id as string,
    botId: (r.bot_id as string | null) ?? null,
    kind: r.kind as MemoryKind,
    text: r.text as string,
    source: r.source as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/**
 * Words too common to tell entries apart (Portuguese and English): matching
 * "de" or "the" would rank every summary as relevant to every task.
 */
const STOP_WORDS = new Set(
  (
    "de da do das dos em no na nos nas um uma uns umas os as ao aos que se por para pra com sem mais mas como ou ja eu tu ele ela nos vos eles elas " +
    "me te lhe meu minha seu sua isso isto esse essa este esta aquele aquela pelo pela tem ter foi ser sao era muito bem voce voces oi ola obrigado " +
    "não nao são já você vocês olá está estão há às também só pelos pelas num numa qual quais quem onde quando porque " +
    "the a an of to in on at for and or but is are was were be been it its this that these those with as by from you your we our they their " +
    "i me my he she him her do does did not no yes so if then than can will would should could have has had please hi hello thanks"
  ).split(" "),
);

/** Turn free text into an FTS5 OR-query of quoted terms, or null when nothing is searchable. */
export function ftsQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP_WORDS.has(w));
  const terms = [...new Set(words)].slice(0, 24);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

export class MemoryRepo {
  constructor(private readonly db: Database) {}

  insert(e: MemoryEntry): MemoryEntry {
    run(
      this.db,
      "INSERT INTO memory (id, bot_id, kind, text, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      e.id,
      e.botId,
      e.kind,
      e.text,
      e.source,
      e.createdAt,
      e.updatedAt,
    );
    return e;
  }

  get(id: string): MemoryEntry | undefined {
    const row = get(this.db, "SELECT * FROM memory WHERE id = ?", id);
    return row ? toEntry(row) : undefined;
  }

  /** A bot's own entries (botId given) or the team's entries (botId null). */
  list(botId: string | null): MemoryEntry[] {
    const rows =
      botId === null
        ? all(this.db, "SELECT * FROM memory WHERE bot_id IS NULL ORDER BY created_at DESC")
        : all(this.db, "SELECT * FROM memory WHERE bot_id = ? ORDER BY created_at DESC", botId);
    return rows.map(toEntry);
  }

  /** Entries of the given kinds visible to a bot: its own and the team's. */
  byKinds(botId: string, kinds: readonly MemoryKind[]): MemoryEntry[] {
    const placeholders = kinds.map(() => "?").join(", ");
    return all(
      this.db,
      `SELECT * FROM memory WHERE (bot_id = ? OR bot_id IS NULL) AND kind IN (${placeholders}) ORDER BY created_at`,
      botId,
      ...kinds,
    ).map(toEntry);
  }

  /**
   * Full-text search over the entries visible to a bot (its own and the team's),
   * best match first. `excludeKinds` leaves out kinds already in the context.
   */
  search(botId: string, text: string, limit: number, excludeKinds: readonly MemoryKind[] = []): MemoryEntry[] {
    const q = ftsQuery(text);
    if (!q) return [];
    const kindFilter = excludeKinds.length ? `AND m.kind NOT IN (${excludeKinds.map(() => "?").join(", ")})` : "";
    return all(
      this.db,
      `SELECT m.* FROM memory_fts f JOIN memory m ON m.rowid = f.rowid
       WHERE memory_fts MATCH ? AND (m.bot_id = ? OR m.bot_id IS NULL) ${kindFilter}
       ORDER BY bm25(memory_fts) LIMIT ?`,
      q,
      botId,
      ...excludeKinds,
      limit,
    ).map(toEntry);
  }

  update(id: string, patch: { text?: string; kind?: MemoryKind }, at: string): void {
    if (patch.text !== undefined) run(this.db, "UPDATE memory SET text = ?, updated_at = ? WHERE id = ?", patch.text, at, id);
    if (patch.kind !== undefined) run(this.db, "UPDATE memory SET kind = ?, updated_at = ? WHERE id = ?", patch.kind, at, id);
  }

  delete(id: string): void {
    run(this.db, "DELETE FROM memory WHERE id = ?", id);
  }

  /** True when the bot already has an entry of this kind with exactly this text. */
  has(botId: string | null, kind: MemoryKind, text: string): boolean {
    return get(this.db, "SELECT 1 AS x FROM memory WHERE bot_id IS ? AND kind = ? AND text = ? LIMIT 1", botId, kind, text) !== undefined;
  }

  /** Delete a bot's oldest entries of a kind beyond the newest `keep`. */
  prune(botId: string, kind: MemoryKind, keep: number): void {
    run(
      this.db,
      `DELETE FROM memory WHERE bot_id = ? AND kind = ? AND id NOT IN (
         SELECT id FROM memory WHERE bot_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      botId,
      kind,
      botId,
      kind,
      keep,
    );
  }

  countForBot(botId: string): number {
    return Number(get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM memory WHERE bot_id = ?", botId)!.n);
  }
}
