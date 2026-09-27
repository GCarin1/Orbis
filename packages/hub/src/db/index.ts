// SQLite through the built-in node:sqlite module (ADR 0002).
import { createRequire } from "node:module";
import path from "node:path";
import { MIGRATIONS } from "./migrations.js";

// node:sqlite prints one ExperimentalWarning on Node.js 22. Filter exactly
// that warning, before the module is loaded, and let every other through.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (/SQLite is an experimental feature/.test(text)) return;
  return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

const require = createRequire(import.meta.url);
const sqlite = require("node:sqlite") as typeof import("node:sqlite");

export type Database = import("node:sqlite").DatabaseSync;
export type SqlValue = null | number | bigint | string | Uint8Array;
export type Row = Record<string, SqlValue>;

export function openDatabase(dataDir: string): Database {
  const file = path.join(dataDir, "orbis.db");
  const db = new sqlite.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        new Date().toISOString(),
      );
    });
  }
}

let depth = 0;

/** Run `fn` inside a transaction; nested calls join the outer one. */
export function transaction<T>(db: Database, fn: () => T): T {
  if (depth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}

export function all<T = Row>(db: Database, sql: string, ...params: SqlValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T = Row>(db: Database, sql: string, ...params: SqlValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(db: Database, sql: string, ...params: SqlValue[]): void {
  db.prepare(sql).run(...params);
}

export function json<T>(value: SqlValue | undefined, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
