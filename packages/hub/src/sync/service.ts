// This hub as a device of an Orbis account (change 0066-runner-link, specs/cloud, ADR 0023): linked once with the
// account's email and password, it gets a token of its own — kept in its vault, revocable from the account — and
// sends what changes here (the sync outbox, migration 15) to the account's database through `device_sync`,
// which checks the token and writes only under the device's owner. Secrets never leave the hub.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { DeviceStatus } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run, transaction } from "../db/index.js";
import { HttpError } from "../errors.js";
import { SYNC_KEYS } from "../db/migrations.js";
import type { SettingsRepo } from "../repos/settings.js";
import type { HubSecrets } from "../secrets/hub-secrets.js";
import type { HubAuth } from "../auth/account.js";
import { InvalidSession } from "../auth/jwt.js";
import { ExportService, isLocalSetting, TABLES, type ExportTable } from "../export/service.js";

export const SYNC_EVERY_MS = 15_000;
/** Rows a call to the cloud carries (the function takes 500 at most). */
export const BATCH = 200;
/** Batches one tick sends at most, so a busy hub keeps answering. */
export const BATCHES_PER_TICK = 25;
const TOKEN_SECRET = "device.token";
const DEVICE_KEY = "device";
const SYNC_ON = "sync.on";

interface Device {
  id: string;
  name: string;
  ownerId: string;
  email: string | null;
  linkedAt: string;
  revoked?: boolean;
}

type Row = Record<string, unknown>;

class CloudError extends Error {
  constructor(
    message: string,
    readonly revoked = false,
  ) {
    super(message);
  }
}

export class SyncService {
  private timer: NodeJS.Timeout | null = null;
  private ticking: Promise<number> | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private failures = 0;
  private nextTryAt = 0;

  constructor(
    private readonly hub: HubContext,
    private readonly deps: { auth: HubAuth; hubSecrets: HubSecrets; settings: SettingsRepo; fetch?: typeof fetch; now?: () => number },
  ) {}

  private get fetcher(): typeof fetch {
    return this.deps.fetch ?? fetch;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private device(): Device | null {
    const raw = this.deps.settings.get(DEVICE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Device;
    } catch {
      return null;
    }
  }

  status(): DeviceStatus {
    const device = this.device();
    const pending = (get<{ n: number }>(this.hub.db, "SELECT COUNT(*) AS n FROM sync_outbox")?.n as number | undefined) ?? 0;
    return {
      available: Boolean(this.hub.config.supabase),
      linked: device ? { id: device.id, name: device.name, ownerId: device.ownerId, email: device.email, linkedAt: device.linkedAt } : null,
      pending,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      revoked: Boolean(device?.revoked),
    };
  }

  private project() {
    const project = this.hub.config.supabase;
    if (!project || !this.deps.auth.tokens) throw new HttpError(409, "accounts_off", "this hub has no account sign-in (ORBIS_SUPABASE_URL is off)");
    return project;
  }

  /** Sign in to the account with its email and password (the hub asks Supabase Auth itself). */
  private async signIn(email: string, password: string): Promise<string> {
    const project = this.project();
    const res = await this.fetcher(`${project.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: project.key, "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { access_token?: string; msg?: string; error_description?: string; error_code?: string } | null;
    if (!res) throw new HttpError(502, "cloud_unreachable", "the sign-in service cannot be reached: check the internet");
    if (!res.ok || !body?.access_token) {
      const wrong = body?.error_code === "invalid_credentials" || res.status === 400;
      throw new HttpError(wrong ? 401 : 502, wrong ? "sign_in_failed" : "cloud_refused", body?.msg ?? body?.error_description ?? `the sign-in service answered HTTP ${res.status}`);
    }
    return body.access_token;
  }

  /** Join the account as a device: its token into the vault, the account linked, everything queued to send once. */
  async link(input: { email?: string; password?: string; accessToken?: string }, name: string): Promise<DeviceStatus> {
    const project = this.project();
    const current = this.device();
    if (current && !current.revoked) throw new HttpError(409, "already_linked", `this hub is already the device "${current.name}" of ${current.email ?? "an account"}: unlink it first`);
    const session = input.accessToken ?? (input.email && input.password ? await this.signIn(input.email, input.password) : null);
    if (!session) throw new HttpError(400, "invalid_request", "give the account's email and password", { email: "required", password: "required" });
    let claims;
    try {
      claims = await this.deps.auth.tokens!.verify(session);
    } catch (err) {
      if (err instanceof InvalidSession) throw new HttpError(400, "invalid_session", `the account's session does not hold: ${err.message}`);
      throw err;
    }
    const linkedAccount = this.deps.auth.linked();
    if (linkedAccount && linkedAccount.userId !== claims.userId) {
      throw new HttpError(409, "other_account", `this hub is linked to another account (${linkedAccount.email ?? linkedAccount.userId}): unlink it in Settings → Account first`);
    }
    const res = await this.fetcher(`${project.url}/rest/v1/rpc/register_device`, {
      method: "POST",
      headers: { apikey: project.key, authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ p_name: name }),
    }).catch(() => null);
    if (!res) throw new HttpError(502, "cloud_unreachable", "the account's database cannot be reached: check the internet");
    const body = (await res.json().catch(() => null)) as Array<{ id: string; token: string }> | { message?: string } | null;
    const made = Array.isArray(body) ? body[0] : null;
    if (!res.ok || !made?.token) {
      throw new HttpError(502, "cloud_refused", `the account did not take this device: ${(body as { message?: string } | null)?.message ?? `HTTP ${res.status}`}`);
    }
    const device: Device = { id: made.id, name, ownerId: claims.userId, email: claims.email, linkedAt: new Date(this.now()).toISOString() };
    try {
      // The token lives only in this hub's vault; the cloud keeps its hash.
      this.deps.hubSecrets.set(TOKEN_SECRET, made.token);
      transaction(this.hub.db, () => {
        this.deps.settings.set(DEVICE_KEY, JSON.stringify(device));
        if (!linkedAccount) this.deps.auth.setLinked(claims.userId, claims.email);
        run(this.hub.db, "DELETE FROM sync_outbox");
        this.deps.settings.set(SYNC_ON, "1");
        this.queueEverything();
      });
    } catch (err) {
      // This hub could not keep the device: the account must not keep it either, or it would stay there unused.
      await this.call("device_unlink", { p_token: made.token }).catch(() => undefined);
      this.deps.hubSecrets.delete(TOKEN_SECRET);
      throw err;
    }
    this.lastError = null;
    this.failures = 0;
    this.nextTryAt = 0;
    void this.tick();
    return this.status();
  }

  /** Every row of every synced table, queued once (the first sync after linking). */
  private queueEverything(): void {
    const at = new Date(this.now()).toISOString();
    for (const table of TABLES) {
      const keys = SYNC_KEYS[table]!;
      const rows = all<Row>(this.hub.db, `SELECT ${keys.join(", ")} FROM ${table}`);
      const insert = this.hub.db.prepare("INSERT INTO sync_outbox (tbl, pk, op, at) VALUES (?, ?, 'upsert', ?)");
      for (const row of rows) {
        if (table === "settings" && isLocalSetting(String(row.key))) continue;
        insert.run(table, JSON.stringify(keys.map((k) => row[k])), at);
      }
    }
  }

  private async call(fn: string, body: unknown): Promise<unknown> {
    const project = this.project();
    let res: Response;
    try {
      res = await this.fetcher(`${project.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: project.key, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CloudError("the account's database cannot be reached");
    }
    const parsed = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
    if (!res.ok) {
      const message = parsed?.message ?? `HTTP ${res.status}`;
      throw new CloudError(message, /device revoked or unknown/.test(message) || parsed?.code === "28000");
    }
    return parsed;
  }

  /** Send what waits, table by table in the order of their references; returns the rows sent. */
  tick(): Promise<number> {
    this.ticking ??= this.send().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async send(): Promise<number> {
    if (!this.deps.settings.get(SYNC_ON)) return 0;
    if (this.now() < this.nextTryAt) return 0;
    const token = this.deps.hubSecrets.get(TOKEN_SECRET);
    if (!token) return 0;
    let sent = 0;
    let batches = 0;
    try {
      for (const table of TABLES) {
        for (;;) {
          if (batches >= BATCHES_PER_TICK) return sent;
          const entries = all<{ seq: number; pk: string; op: "upsert" | "delete" }>(
            this.hub.db,
            "SELECT seq, pk, op FROM sync_outbox WHERE tbl = ? ORDER BY seq LIMIT ?",
            table,
            BATCH,
          );
          if (!entries.length) break;
          const { upserts, deletes } = this.rowsOf(table, entries);
          if (upserts.length || deletes.length) await this.call("device_sync", { p_token: token, p_table: table, p_upserts: upserts, p_deletes: deletes });
          run(this.hub.db, "DELETE FROM sync_outbox WHERE tbl = ? AND seq <= ?", table, entries.at(-1)!.seq);
          sent += upserts.length + deletes.length;
          batches++;
        }
      }
      this.lastSyncAt = new Date(this.now()).toISOString();
      this.lastError = null;
      this.failures = 0;
      return sent;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      if (err instanceof CloudError && err.revoked) {
        // The account revoked this device: nothing more is sent until it is linked again.
        const device = this.device();
        if (device) this.deps.settings.set(DEVICE_KEY, JSON.stringify({ ...device, revoked: true }));
        this.deps.settings.delete(SYNC_ON);
        run(this.hub.db, "DELETE FROM sync_outbox");
        this.deps.hubSecrets.delete(TOKEN_SECRET);
        this.lastError = "the account revoked this device";
        return sent;
      }
      this.failures++;
      this.nextTryAt = this.now() + Math.min(15 * 60_000, SYNC_EVERY_MS * 2 ** Math.min(this.failures, 6));
      return sent;
    }
  }

  /** The latest state of each row the entries name: the rows as the cloud takes them, and the keys of the gone. */
  private rowsOf(table: ExportTable, entries: Array<{ pk: string; op: "upsert" | "delete" }>): { upserts: Row[]; deletes: Row[] } {
    const keys = SYNC_KEYS[table]!;
    const latest = new Map<string, "upsert" | "delete">();
    for (const e of entries) latest.set(e.pk, e.op);
    const upserts: Row[] = [];
    const deletes: Row[] = [];
    for (const [pk, op] of latest) {
      const values = JSON.parse(pk) as unknown[];
      const where = keys.map((k) => `${k} = ?`).join(" AND ");
      const row = op === "upsert" ? get<Row>(this.hub.db, `SELECT * FROM ${table} WHERE ${where}`, ...(values as Array<string | number>)) : undefined;
      if (row) {
        const mapped = ExportService.cloudRow(table, row);
        if (mapped) upserts.push(mapped);
      } else {
        deletes.push(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
      }
    }
    return { upserts, deletes };
  }

  /** Leave the account: the token stops working there, and nothing of the device stays here. */
  async unlink(): Promise<DeviceStatus> {
    const token = this.deps.hubSecrets.get(TOKEN_SECRET);
    if (token && this.hub.config.supabase) await this.call("device_unlink", { p_token: token }).catch(() => undefined);
    this.deps.hubSecrets.delete(TOKEN_SECRET);
    transaction(this.hub.db, () => {
      this.deps.settings.delete(SYNC_ON);
      this.deps.settings.delete(DEVICE_KEY);
      run(this.hub.db, "DELETE FROM sync_outbox");
    });
    this.lastError = null;
    this.lastSyncAt = null;
    return this.status();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), SYNC_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    // Only the hub's own token makes this hub a device of an account, or unmakes it.
    const tokenOnly = (req: FastifyRequest) => {
      if (this.deps.auth.viaOf(req) !== "token") throw new HttpError(403, "token_required", "sign in to the hub with its token to manage its device link");
    };
    app.get("/api/v1/device", { schema: { tags: ["account"] } }, async (): Promise<DeviceStatus> => this.status());
    app.post(
      "/api/v1/device/link",
      {
        schema: {
          tags: ["account"],
          body: Type.Object(
            {
              name: Type.String({ minLength: 1, maxLength: 80 }),
              email: Type.Optional(Type.String({ maxLength: 320 })),
              password: Type.Optional(Type.String({ maxLength: 1024 })),
              accessToken: Type.Optional(Type.String({ minLength: 20, maxLength: 8192 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (req): Promise<DeviceStatus> => {
        tokenOnly(req);
        return this.link(req.body, req.body.name.trim());
      },
    );
    app.post("/api/v1/device/sync", { schema: { tags: ["account"] } }, async (req): Promise<DeviceStatus> => {
      tokenOnly(req);
      this.nextTryAt = 0;
      await this.tick();
      return this.status();
    });
    app.delete("/api/v1/device", { schema: { tags: ["account"] } }, async (req): Promise<DeviceStatus> => {
      tokenOnly(req);
      return this.unlink();
    });
  }
}
