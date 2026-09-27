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

/** Turn free text into an FTS5 OR-query of quoted terms, or null when nothing is searchable. */
export function ftsQuery(text: string): string | null {
  const terms = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 24))];
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

  countForBot(botId: string): number {
    return Number(get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM memory WHERE bot_id = ?", botId)!.n);
  }
}
