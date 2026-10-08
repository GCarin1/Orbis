// Export and import (change 0065-export-import, specs/cloud): a `.orbis` file holds everything a hub keeps —
// every table but the vault, the conversations' files, the skills — and, sealed by a password the user
// chooses, the secrets. It imports into a hub (the secrets with it) or into the user's Orbis account in the
// cloud (never the secrets), and importing it again adds nothing twice.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { ImportReport } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, transaction, type Database } from "../db/index.js";
import { LOCAL_SETTING_KEYS, MIGRATIONS } from "../db/migrations.js";
import { HttpError } from "../errors.js";
import type { Vault } from "../secrets/vault.js";
import type { HubSecrets } from "../secrets/hub-secrets.js";
import type { HubAuth } from "../auth/account.js";
import { InvalidSession } from "../auth/jwt.js";
import { readZip, safePath, writeZip, ZipError, type ZipEntry } from "./zip.js";
import { MIN_EXPORT_PASSWORD, seal, unseal, WrongPassword, type Sealed } from "./seal.js";

export const FORMAT = "orbis-export";
export const FORMAT_VERSION = 1;
/** An import may be this large (a phone holds it in memory once). */
export const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

type Row = Record<string, unknown>;

/**
 * The tables an export carries, in the order an import writes them (each after what it points at). Left out:
 * the vault (`secrets`, sealed apart), `brain_sessions` (CLI sessions of the old machine), `memory_fts`
 * (rebuilt by its triggers) and `schema_migrations`.
 */
export const TABLES = [
  "settings",
  "squads",
  "bots",
  "conversations",
  "conversation_members",
  "items",
  "runs",
  "memory",
  "routines",
  "routine_runs",
  "approvals",
  "mcp_servers",
  "hiring_rounds",
  "hiring_candidates",
  "files",
  "initiatives",
  "health_metrics",
  "health_sessions",
] as const;
export type ExportTable = (typeof TABLES)[number];

/** Settings that belong to this hub, not to the data: the linked account and device, the last activity, the vault's. */
const LOCAL_SETTINGS = new Set(LOCAL_SETTING_KEYS);
export const isLocalSetting = (key: string) => key.startsWith("secret:") || LOCAL_SETTINGS.has(key);
/** MCP OAuth sign-ins are made for the old hub's address, and a device token is this hub's: neither travels. */
const isOAuthSecret = (name: string) => /^mcp\..+\.oauth$/.test(name) || name === "device.token";

/** How each table's columns go into the cloud (supabase/migrations/0001_orbis_core.sql). */
export const CLOUD: Record<ExportTable, { key: string[]; json?: string[]; bool?: string[]; drop?: string[] }> = {
  settings: { key: ["key"] },
  squads: { key: ["id"] },
  bots: { key: ["id"], json: ["brain", "policy", "computer", "tools", "skills", "initiative"], bool: ["cap_includes_subscription", "pinned", "hidden"] },
  conversations: { key: ["id"], bool: ["muted"] },
  conversation_members: { key: ["conversation_id", "bot_id"] },
  items: { key: ["id"], json: ["mentions", "attachments", "reactions", "card", "event"] },
  runs: { key: ["id"], json: ["steps"], bool: ["subscription"] },
  memory: { key: ["id"] },
  routines: { key: ["id"], json: ["trigger"], bool: ["enabled", "paused"], drop: ["secret"] },
  routine_runs: { key: ["id"], bool: ["test"] },
  approvals: { key: ["id"], json: ["input"] },
  mcp_servers: { key: ["id"], json: ["args", "env_keys", "tools"], bool: ["read_only"] },
  hiring_rounds: { key: ["id"] },
  hiring_candidates: { key: ["id"], json: ["strengths", "tools"] },
  files: { key: ["id"] },
  initiatives: { key: ["id"], bool: ["posted"] },
  health_metrics: { key: ["date", "metric"] },
  health_sessions: { key: ["id"] },
};

export interface Manifest {
  format: typeof FORMAT;
  formatVersion: number;
  /** The hub's schema version when it exported (its last migration). */
  schemaVersion: number;
  hubVersion: string;
  exportedAt: string;
  counts: Record<string, number>;
  files: number;
  skills: number;
  /** Whether the secrets are in the file, sealed by the export password. */
  secrets: boolean;
  parts: Array<{ path: string; sha256: string; bytes: number }>;
}

interface SealedSecrets {
  bots: Array<{ botId: string; name: string; value: string }>;
  hub: Array<{ name: string; value: string }>;
  routines: Array<{ id: string; secret: string }>;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const jsonl = (rows: Row[]) => Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
const parseJsonl = (data: Buffer, part: string): Row[] =>
  data
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        const row = JSON.parse(line) as unknown;
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error();
        return row as Row;
      } catch {
        throw new HttpError(400, "invalid_export", `${part}: line ${i + 1} is not a row`);
      }
    });

const headerText = (req: FastifyRequest, name: string): string | null => {
  const raw = req.headers[name];
  if (typeof raw !== "string" || !raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export class ExportService {
  private readonly db: Database;

  constructor(
    private readonly hub: HubContext,
    private readonly deps: {
      vault: Vault;
      hubSecrets: HubSecrets;
      filesDir: string;
      auth: HubAuth;
      afterImport(): void;
      fetch?: typeof fetch;
    },
  ) {
    this.db = hub.db;
  }

  private get dataDir(): string {
    return this.hub.config.dataDir;
  }

  // --- export ----------------------------------------------------------------------------------------------

  private rows(table: ExportTable): Row[] {
    if (table === "items") return all<Row>(this.db, "SELECT * FROM items ORDER BY seq").map(({ seq: _seq, ...row }) => row);
    if (table === "settings") return all<Row>(this.db, "SELECT key, value FROM settings ORDER BY key").filter((r) => !isLocalSetting(String(r.key)));
    if (table === "routines") return all<Row>(this.db, "SELECT * FROM routines ORDER BY created_at, id").map(({ secret: _secret, ...row }) => row);
    return all<Row>(this.db, `SELECT * FROM ${table}`);
  }

  /** Every SKILL.md under the data directory: the account's and each bot's. */
  private skillFiles(): Array<{ rel: string; data: Buffer }> {
    const found: Array<{ rel: string; data: Buffer }> = [];
    const walk = (dir: string, rel: string) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name, "SKILL.md");
        if (existsSync(file) && statSync(file).isFile()) found.push({ rel: `${rel}/${name}/SKILL.md`, data: readFileSync(file) });
      }
    };
    walk(path.join(this.dataDir, "skills"), "skills");
    const bots = path.join(this.dataDir, "bots");
    if (existsSync(bots)) for (const id of readdirSync(bots)) walk(path.join(bots, id, "skills"), `bots/${id}/skills`);
    return found.filter((f) => safePath(f.rel));
  }

  private secrets(): SealedSecrets {
    const bots = all<{ bot_id: string; name: string; ciphertext: string }>(this.db, "SELECT bot_id, name, ciphertext FROM secrets").map((r) => ({
      botId: r.bot_id,
      name: r.name,
      value: this.deps.vault.decrypt(r.bot_id, r.name, r.ciphertext),
    }));
    const hub = all<{ key: string }>(this.db, "SELECT key FROM settings WHERE key LIKE 'secret:%'")
      .map((r) => r.key.slice("secret:".length))
      .filter((name) => !isOAuthSecret(name))
      .flatMap((name) => {
        const value = this.deps.hubSecrets.get(name);
        return value === null ? [] : [{ name, value }];
      });
    const routines = all<{ id: string; secret: string }>(this.db, "SELECT id, secret FROM routines");
    return { bots, hub, routines };
  }

  /** The `.orbis` file: a manifest, one JSON Lines part per table, the files, the skills, the sealed secrets. */
  export(password: string | null): { zip: Buffer; manifest: Manifest } {
    if (password !== null && password.length < MIN_EXPORT_PASSWORD) {
      throw new HttpError(400, "invalid_request", `the export password needs at least ${MIN_EXPORT_PASSWORD} characters`, { password: `at least ${MIN_EXPORT_PASSWORD} characters` });
    }
    const entries: ZipEntry[] = [];
    const counts: Record<string, number> = {};
    // One read transaction: the parts agree with each other.
    transaction(this.db, () => {
      for (const table of TABLES) {
        const rows = this.rows(table);
        counts[table] = rows.length;
        entries.push({ path: `tables/${table}.jsonl`, data: jsonl(rows) });
      }
      let files = 0;
      for (const { id } of all<{ id: string }>(this.db, "SELECT id FROM files")) {
        const file = path.join(this.deps.filesDir, id);
        if (/^fil_[A-Za-z0-9_-]+$/.test(id) && existsSync(file)) {
          entries.push({ path: `files/${id}`, data: readFileSync(file) });
          files++;
        }
      }
      counts["#files"] = files;
      if (password !== null) entries.push({ path: "secrets.sealed.json", data: Buffer.from(JSON.stringify(seal(this.secrets(), password)), "utf8") });
    });
    const skills = this.skillFiles();
    for (const s of skills) entries.push({ path: s.rel, data: s.data });
    const fileCount = counts["#files"]!;
    delete counts["#files"];
    const manifest: Manifest = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      schemaVersion: MIGRATIONS.at(-1)!.version,
      hubVersion: this.hub.config.version,
      exportedAt: new Date().toISOString(),
      counts,
      files: fileCount,
      skills: skills.length,
      secrets: password !== null,
      parts: entries.map((e) => ({ path: e.path, sha256: sha256(e.data), bytes: e.data.length })),
    };
    return { zip: writeZip([{ path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") }, ...entries]), manifest };
  }

  // --- reading an export -----------------------------------------------------------------------------------

  /** The parts of an export, checked against its manifest: every part listed, every hash right, nothing more. */
  read(zip: Buffer): { manifest: Manifest; parts: Map<string, Buffer> } {
    let entries: ZipEntry[];
    try {
      entries = readZip(zip);
    } catch (err) {
      if (err instanceof ZipError) throw new HttpError(400, "invalid_export", `not a .orbis export: ${err.message}`);
      throw err;
    }
    const byPath = new Map(entries.map((e) => [e.path, e.data]));
    const raw = byPath.get("manifest.json");
    if (!raw) throw new HttpError(400, "invalid_export", "not a .orbis export: it has no manifest.json");
    let manifest: Manifest;
    try {
      manifest = JSON.parse(raw.toString("utf8")) as Manifest;
    } catch {
      throw new HttpError(400, "invalid_export", "the export's manifest.json is not JSON");
    }
    if (manifest.format !== FORMAT || !Array.isArray(manifest.parts)) throw new HttpError(400, "invalid_export", "not a .orbis export");
    if (manifest.formatVersion !== FORMAT_VERSION) throw new HttpError(400, "invalid_export", `this export's format (${manifest.formatVersion}) is not one this hub reads: update Orbis`);
    if (manifest.schemaVersion > MIGRATIONS.at(-1)!.version) throw new HttpError(400, "invalid_export", "this export comes from a newer Orbis: update this hub first");
    const parts = new Map<string, Buffer>();
    for (const part of manifest.parts) {
      const data = byPath.get(part.path);
      if (!data) throw new HttpError(400, "invalid_export", `the export lacks ${part.path}`);
      if (sha256(data) !== part.sha256) throw new HttpError(400, "invalid_export", `${part.path} was changed after the export (its SHA-256 does not match)`);
      parts.set(part.path, data);
    }
    for (const p of byPath.keys()) {
      if (p !== "manifest.json" && !parts.has(p)) throw new HttpError(400, "invalid_export", `${p} is not in the export's manifest`);
    }
    return { manifest, parts };
  }

  private tableRows(parts: Map<string, Buffer>, table: ExportTable): Row[] {
    const data = parts.get(`tables/${table}.jsonl`);
    return data ? parseJsonl(data, `tables/${table}.jsonl`) : [];
  }

  private openSecrets(parts: Map<string, Buffer>, password: string | null): SealedSecrets | null {
    const data = parts.get("secrets.sealed.json");
    if (!data || password === null) return null;
    try {
      return unseal<SealedSecrets>(JSON.parse(data.toString("utf8")) as Sealed, password);
    } catch (err) {
      if (err instanceof WrongPassword) throw new HttpError(400, "wrong_password", err.message, { password: "wrong password" });
      throw new HttpError(400, "invalid_export", err instanceof Error ? err.message : String(err));
    }
  }

  private emptyReport(target: ImportReport["target"], manifest: Manifest, parts: Map<string, Buffer>): ImportReport {
    return {
      target,
      exportedAt: manifest.exportedAt,
      tables: {},
      files: { added: 0, skipped: 0 },
      skills: { added: 0, skipped: 0 },
      secrets: { added: 0, skipped: 0, inFile: parts.has("secrets.sealed.json"), opened: false },
      warnings: [],
    };
  }

  // --- import into this hub --------------------------------------------------------------------------------

  importToHub(zip: Buffer, password: string | null): ImportReport {
    const { manifest, parts } = this.read(zip);
    const sealed = this.openSecrets(parts, password);
    const report = this.emptyReport("hub", manifest, parts);
    report.secrets.opened = sealed !== null;
    if (report.secrets.inFile && !sealed) report.warnings.push("The export's secrets were not imported: give its password to bring them.");
    if (!report.secrets.inFile) report.warnings.push("The export holds no secrets (it was made without a password): set the bots' keys again.");

    const rowsOf = new Map(TABLES.map((t) => [t, this.tableRows(parts, t)] as const));
    // A different bot or squad already answering to a handle would break the export's references.
    const clashes: Record<string, string> = {};
    for (const [table, label] of [["bots", "bot"], ["squads", "squad"]] as const) {
      for (const row of rowsOf.get(table)!) {
        const there = get<{ id: string }>(this.db, `SELECT id FROM ${table} WHERE handle = ?`, String(row.handle));
        if (there && there.id !== row.id) clashes[`${table}.${String(row.handle)}`] = `this hub already has another ${label} @${String(row.handle)}`;
      }
    }
    if (Object.keys(clashes).length) {
      throw new HttpError(409, "import_conflict", `this hub already has bots or squads with the export's handles (${Object.keys(clashes).map((k) => "@" + k.split(".").slice(1).join(".")).join(", ")}): import into an empty hub, or rename them first`, clashes);
    }

    const routineSecrets = new Map((sealed?.routines ?? []).map((r) => [r.id, r.secret]));
    let newWebhookSecrets = 0;
    let leftHost = 0;
    try {
      this.writeRows(rowsOf, routineSecrets, report, {
        newSecret: () => newWebhookSecrets++,
        leftHost: () => leftHost++,
      });
    } catch (err) {
      // A reference to a row the export lacks: nothing was written.
      if (err instanceof Error && /FOREIGN KEY|constraint/i.test(err.message)) {
        throw new HttpError(400, "invalid_export", `the export's rows do not hold together (${err.message}): nothing was imported`);
      }
      throw err;
    }
    if (newWebhookSecrets) report.warnings.push(`${newWebhookSecrets} routine webhook(s) got a new secret: update the services that call them.`);
    this.writeFiles(parts, report, sealed);
    if ((report.tables.mcp_servers?.added ?? 0) > 0) report.warnings.push("MCP servers signed in with an account (OAuth) must be signed in again on this hub.");
    if (leftHost) report.warnings.push(`${leftHost} bot(s) worked on the old machine itself ("my computer"): they work in their own isolated computer now; give them this machine again in their settings if you want.`);
    this.deps.afterImport();
    return report;
  }

  /** Every table's rows in one transaction; a row already here is kept as it is. */
  private writeRows(
    rowsOf: Map<ExportTable, Row[]>,
    routineSecrets: Map<string, string>,
    report: ImportReport,
    note: { newSecret(): void; leftHost(): void },
  ): void {
    transaction(this.db, () => {
      // References are checked once every table is in (bots and squads point at each other).
      this.db.exec("PRAGMA defer_foreign_keys = ON");
      for (const table of TABLES) {
        const columns = new Set(all<{ name: string }>(this.db, `PRAGMA table_info(${table})`).map((c) => c.name));
        const counts = { added: 0, skipped: 0 };
        for (const source of rowsOf.get(table)!) {
          const row: Row = { ...source };
          if (table === "settings" && isLocalSetting(String(row.key))) continue;
          if (table === "items") delete row.seq;
          // Nothing was working when it arrived here.
          if (table === "bots") {
            row.state = "idle";
            // Working on the user's own machine is a consent given on that machine (ADR 0009): never carried over.
            const computer = parseJson(row.computer);
            if (computer && computer.provider === "host") {
              row.computer = JSON.stringify({ ...computer, provider: "local", hostDir: undefined });
              note.leftHost();
            }
          }
          if (table === "runs" && ["queued", "running", "waiting"].includes(String(row.status))) {
            row.status = "cancelled";
            row.error = "exported while it ran";
          }
          if (table === "approvals" && row.status === "pending") row.status = "expired";
          if (table === "routines") {
            const secret = routineSecrets.get(String(row.id));
            if (!secret) note.newSecret();
            row.secret = secret ?? randomBytes(24).toString("base64url");
          }
          const keys = Object.keys(row).filter((k) => columns.has(k));
          const result = this.db
            .prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
            .run(...keys.map((k) => toSqlite(row[k])));
          if (Number(result.changes) > 0) counts.added++;
          else counts.skipped++;
        }
        report.tables[table] = counts;
      }
    });
  }

  /** The files' bytes and the skills this hub lacks, and the secrets into its vault (sealed again with its key). */
  private writeFiles(parts: Map<string, Buffer>, report: ImportReport, sealed: SealedSecrets | null): void {
    mkdirSync(this.deps.filesDir, { recursive: true, mode: 0o700 });
    for (const [p, data] of parts) {
      if (!p.startsWith("files/")) continue;
      const id = p.slice("files/".length);
      const target = path.join(this.deps.filesDir, id);
      if (!/^fil_[A-Za-z0-9_-]+$/.test(id) || !get(this.db, "SELECT id FROM files WHERE id = ?", id) || existsSync(target)) {
        report.files.skipped++;
        continue;
      }
      writeFileSync(target, data, { mode: 0o600 });
      report.files.added++;
    }
    for (const [p, data] of parts) {
      if (!/^(skills\/[^/]+|bots\/[^/]+\/skills\/[^/]+)\/SKILL\.md$/.test(p)) continue;
      const target = path.join(this.dataDir, ...p.split("/"));
      if (existsSync(target)) {
        report.skills.skipped++;
        continue;
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, data);
      report.skills.added++;
    }
    if (!sealed) return;
    for (const s of sealed.bots) {
      if (!get(this.db, "SELECT id FROM bots WHERE id = ?", s.botId) || this.deps.vault.get(s.botId, s.name) !== null) {
        report.secrets.skipped++;
        continue;
      }
      this.deps.vault.set(s.botId, s.name, s.value);
      report.secrets.added++;
    }
    for (const s of sealed.hub) {
      if (isOAuthSecret(s.name) || this.deps.hubSecrets.has(s.name)) {
        report.secrets.skipped++;
        continue;
      }
      this.deps.hubSecrets.set(s.name, s.value);
      report.secrets.added++;
    }
  }

  // --- import into the cloud account -----------------------------------------------------------------------

  /** A row as the cloud's table takes it: JSON columns as JSON, flags as booleans, the hub's own columns out. */
  static cloudRow(table: ExportTable, source: Row): Row | null {
    const spec = CLOUD[table];
    if (table === "settings" && isLocalSetting(String(source.key))) return null;
    const row: Row = {};
    for (const [k, v] of Object.entries(source)) {
      if (k === "seq" || k === "owner_id" || spec.drop?.includes(k)) continue;
      if (spec.json?.includes(k)) row[k] = typeof v === "string" ? JSON.parse(v) : v;
      else if (spec.bool?.includes(k)) row[k] = v === null ? null : Boolean(v);
      else row[k] = v;
    }
    if (table === "bots") {
      row.state = "idle";
      const computer = row.computer as Record<string, unknown> | null;
      if (computer && computer.provider === "host") row.computer = { ...computer, provider: "local", hostDir: undefined };
    }
    if (table === "runs" && ["queued", "running", "waiting"].includes(String(row.status))) {
      row.status = "cancelled";
      row.error = "exported while it ran";
    }
    if (table === "approvals" && row.status === "pending") row.status = "expired";
    return row;
  }

  async importToCloud(zip: Buffer, session: string): Promise<ImportReport> {
    const project = this.hub.config.supabase;
    if (!project || !this.deps.auth.tokens) throw new HttpError(409, "accounts_off", "this hub has no account sign-in (ORBIS_SUPABASE_URL is off)");
    // The session is the account's own: the cloud writes its rows under it, closed by row level security.
    try {
      await this.deps.auth.tokens.verify(session);
    } catch (err) {
      if (err instanceof InvalidSession) throw new HttpError(401, "invalid_session", `sign in to your account again: ${err.message}`);
      throw err;
    }
    const { manifest, parts } = this.read(zip);
    const report = this.emptyReport("cloud", manifest, parts);
    if (report.secrets.inFile) report.warnings.push("The secrets stay in the file: the cloud never keeps them. They go to your phone's hub when it is linked to the account.");
    const fetcher = this.deps.fetch ?? fetch;
    for (const table of TABLES) {
      const rows = this.tableRows(parts, table)
        .map((r) => ExportService.cloudRow(table, r))
        .filter((r): r is Row => r !== null);
      const counts = { added: 0, skipped: 0 };
      const spec = CLOUD[table];
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const url = `${project.url}/rest/v1/${table}?on_conflict=${["owner_id", ...spec.key].join(",")}&select=${spec.key[0]}`;
        const res = await fetcher(url, {
          method: "POST",
          headers: {
            apikey: project.key,
            authorization: `Bearer ${session}`,
            "content-type": "application/json",
            // Rows already in the account stay as they are: importing again adds nothing.
            prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
          throw new HttpError(502, "cloud_refused", `the cloud refused the ${table} rows: ${body?.message ?? `HTTP ${res.status}`}${body?.code ? ` (${body.code})` : ""}`);
        }
        const inserted = ((await res.json().catch(() => [])) as unknown[]).length;
        counts.added += inserted;
        counts.skipped += batch.length - inserted;
      }
      report.tables[table] = counts;
    }
    report.files.skipped = manifest.files;
    if (manifest.files) report.warnings.push(`The ${manifest.files} files' contents go up when the cloud's file storage opens; keep this .orbis file.`);
    report.skills.skipped = manifest.skills;
    if (manifest.skills) report.warnings.push(`The ${manifest.skills} skills stay on the hub until the cloud keeps them; keep this .orbis file.`);
    return report;
  }

  // --- routes ----------------------------------------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    app.post(
      "/api/v1/export",
      { schema: { tags: ["export"], body: Type.Object({ password: Type.Optional(Type.String({ maxLength: 1024 })) }, { additionalProperties: false }) } },
      async (req, reply) => {
        const { zip } = this.export(req.body.password ? req.body.password : null);
        const name = `orbis-${new Date().toISOString().slice(0, 10)}.orbis`;
        reply
          .header("content-type", "application/zip")
          .header("content-disposition", `attachment; filename="${name}"`)
          .header("x-content-type-options", "nosniff")
          .header("cache-control", "no-store");
        return reply.send(zip);
      },
    );
    await root.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_IMPORT_BYTES }, (_req, body, done) => done(null, body));
      const body = (req: FastifyRequest): Buffer => {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "invalid_request", "send the .orbis file as the request body");
        return req.body;
      };
      scope.post("/api/v1/import", { bodyLimit: MAX_IMPORT_BYTES, schema: { tags: ["export"] } }, async (req): Promise<ImportReport> =>
        this.importToHub(body(req), headerText(req, "x-orbis-export-password")),
      );
      scope.post("/api/v1/import/cloud", { bodyLimit: MAX_IMPORT_BYTES, schema: { tags: ["export"] } }, async (req): Promise<ImportReport> => {
        const session = headerText(req, "x-orbis-account");
        if (!session) throw new HttpError(401, "invalid_session", "sign in to the account to import into (x-orbis-account)");
        return this.importToCloud(body(req), session);
      });
    });
  }
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "string") return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  try {
    const parsed = JSON.parse(v) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A value as node:sqlite binds it (objects as their JSON, flags as numbers). */
function toSqlite(v: unknown): string | number | bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "string") return v;
  return JSON.stringify(v);
}
