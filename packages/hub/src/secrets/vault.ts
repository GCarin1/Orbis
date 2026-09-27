// Per-bot secrets encrypted with AES-256-GCM (specs/secrets, ADR 0008).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { all, get, run, type Database } from "../db/index.js";

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MASK = "••••";
const PLACEHOLDER = /\{\{secret:([A-Z][A-Z0-9_]{0,63})\}\}/g;

export class SecretMissingError extends Error {
  constructor(public readonly names: string[]) {
    super(`secret${names.length > 1 ? "s" : ""} ${names.join(", ")} not set for this bot`);
  }
}

/** The key: ORBIS_MASTER_KEY (64 hex characters), else `<data>/master.key` generated once with mode 0600. */
export function loadMasterKey(dataDir: string, fromEnv: string | null): Buffer {
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) throw new Error("ORBIS_MASTER_KEY must be 64 hexadecimal characters (32 bytes)");
    return Buffer.from(fromEnv, "hex");
  }
  const file = path.join(dataDir, "master.key");
  if (existsSync(file)) {
    const hex = readFileSync(file, "utf8").trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${file} is not a 64-hex-character key`);
    return Buffer.from(hex, "hex");
  }
  const key = randomBytes(32);
  writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return key;
}

export class Vault {
  constructor(
    private readonly db: Database,
    private readonly key: Buffer,
  ) {}

  /** The bot and the name are authenticated with the value: a row moved elsewhere no longer decrypts. */
  private aad(botId: string, name: string): Buffer {
    return Buffer.from(`${botId}\0${name}`);
  }

  encrypt(botId: string, name: string, value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(this.aad(botId, name));
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }

  decrypt(botId: string, name: string, stored: string): string {
    const raw = Buffer.from(stored, "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
    decipher.setAAD(this.aad(botId, name));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }

  set(botId: string, name: string, value: string): { name: string; createdAt: string } {
    if (!SECRET_NAME.test(name)) throw new Error("a secret name is 1 to 64 characters of A-Z, 0-9 and _, starting with a letter");
    const createdAt = new Date().toISOString();
    run(
      this.db,
      `INSERT INTO secrets (bot_id, name, ciphertext, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(bot_id, name) DO UPDATE SET ciphertext = excluded.ciphertext, created_at = excluded.created_at`,
      botId,
      name,
      this.encrypt(botId, name, value),
      createdAt,
    );
    return { name, createdAt };
  }

  /** The value, or null when the bot has no such secret (or its row does not decrypt). */
  get(botId: string, name: string): string | null {
    const row = get(this.db, "SELECT ciphertext FROM secrets WHERE bot_id = ? AND name = ?", botId, name);
    if (!row) return null;
    try {
      return this.decrypt(botId, name, row.ciphertext as string);
    } catch {
      return null;
    }
  }

  list(botId: string): Array<{ name: string; createdAt: string }> {
    return all(this.db, "SELECT name, created_at FROM secrets WHERE bot_id = ? ORDER BY name", botId).map((r) => ({
      name: r.name as string,
      createdAt: r.created_at as string,
    }));
  }

  delete(botId: string, name: string): boolean {
    const before = this.list(botId).length;
    run(this.db, "DELETE FROM secrets WHERE bot_id = ? AND name = ?", botId, name);
    return this.list(botId).length < before;
  }

  /** Every value of the bot, longest first (so a value containing another is masked whole). */
  values(botId: string): string[] {
    return this.list(botId)
      .map((s) => this.get(botId, s.name))
      .filter((v): v is string => v !== null && v.length > 0)
      .sort((a, b) => b.length - a.length);
  }

  /** Replace every value of the bot in `text` with the mask. */
  redact(botId: string, text: string): string {
    let out = text;
    for (const value of this.values(botId)) out = out.split(value).join(MASK);
    return out;
  }

  /** Redact every string inside a JSON-like value. */
  redactDeep<T>(botId: string, value: T): T {
    const values = this.values(botId);
    if (values.length === 0) return value;
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return values.reduce((s, secret) => s.split(secret).join(MASK), v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    return walk(value) as T;
  }

  /** Replace `{{secret:NAME}}` in every string of `input` with the bot's values; throws for unknown names. */
  resolve<T>(botId: string, input: T): T {
    const missing = new Set<string>();
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") {
        return v.replace(PLACEHOLDER, (whole, name: string) => {
          const value = this.get(botId, name);
          if (value === null) {
            missing.add(name);
            return whole;
          }
          return value;
        });
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    const resolved = walk(input) as T;
    if (missing.size) throw new SecretMissingError([...missing]);
    return resolved;
  }
}

export function hasPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return /\{\{secret:[A-Z][A-Z0-9_]{0,63}\}\}/.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === "object") return Object.values(value).some(hasPlaceholder);
  return false;
}
