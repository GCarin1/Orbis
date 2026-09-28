// Hub-wide settings changed from the app (the `settings` table): key → text.
import { get, run, type Database } from "../db/index.js";

export class SettingsRepo {
  constructor(private readonly db: Database) {}

  get(key: string): string | null {
    return (get(this.db, "SELECT value FROM settings WHERE key = ?", key)?.value as string | undefined) ?? null;
  }

  set(key: string, value: string): void {
    run(this.db, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  delete(key: string): void {
    run(this.db, "DELETE FROM settings WHERE key = ?", key);
  }
}
