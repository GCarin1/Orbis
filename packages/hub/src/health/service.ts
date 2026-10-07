// The user's health data (specs/health, change 0062-health-connect): the Orbis app on the phone reads
// Health Connect — where Google Fit, Zepp (Amazfit), Samsung Health and Fitbit write — and sends one value
// per day and metric, and the workouts, to the hub. Only the bots the user gives it to (`health.*` in their
// allowlist; `*` never does) read it, with `health.summary` and `health.sessions`.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { HEALTH_METRICS, toolAllowed, type Bot, type HealthDay, type HealthMetric, type HealthSession, type HealthStatus, type HealthSync } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run as exec, transaction } from "../db/index.js";
import { badRequest } from "../errors.js";
import { nowIso } from "../ids.js";
import type { SettingsRepo } from "../repos/settings.js";
import type { ToolDefinition } from "../tools/registry.js";

const SETTINGS_KEY = "health";
/** The prefix a bot's allowlist must name for the health tools: `*` alone never gives them. */
export const HEALTH_PREFIX = "health.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 120;
const MAX_SESSIONS = 1_000;

const METRIC_NAMES: Record<HealthMetric, string> = {
  steps: "steps",
  distance_m: "distance",
  active_kcal: "active calories",
  total_kcal: "total calories",
  heart_rate_avg: "heart rate (avg)",
  heart_rate_min: "heart rate (min)",
  heart_rate_max: "heart rate (max)",
  resting_heart_rate: "resting heart rate",
  sleep_minutes: "sleep",
  sleep_deep_minutes: "deep sleep",
  sleep_rem_minutes: "REM sleep",
  sleep_light_minutes: "light sleep",
  sleep_awake_minutes: "awake in bed",
  exercise_minutes: "exercise",
  weight_kg: "weight",
  body_fat_pct: "body fat",
  oxygen_saturation_avg: "blood oxygen (avg)",
};

const isMetric = (key: string): key is HealthMetric => Object.prototype.hasOwnProperty.call(HEALTH_METRICS, key);

/** A value as a person reads it: minutes as hours, metres as kilometres, at most one decimal. */
export function shown(metric: HealthMetric, value: number): string {
  const one = (n: number) => String(Math.round(n * 10) / 10);
  if (metric.endsWith("_minutes")) return value >= 60 ? `${Math.floor(value / 60)} h ${Math.round(value % 60)} min` : `${Math.round(value)} min`;
  if (metric === "distance_m") return value >= 1000 ? `${one(value / 1000)} km` : `${Math.round(value)} m`;
  if (metric === "steps" || metric.endsWith("_kcal")) return String(Math.round(value));
  return `${one(value)} ${HEALTH_METRICS[metric]}`;
}

interface Saved {
  lastSyncAt: string | null;
  sources: string[];
}

export class HealthService {
  constructor(
    private readonly hub: HubContext,
    private readonly settings: SettingsRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private saved(): Saved {
    try {
      return { lastSyncAt: null, sources: [], ...(JSON.parse(this.settings.get(SETTINGS_KEY) ?? "{}") as Partial<Saved>) };
    } catch {
      return { lastSyncAt: null, sources: [] };
    }
  }

  /** Keep what the phone read: each day's values replace the ones of that day, the workouts by id. */
  sync(input: HealthSync): HealthStatus {
    if (input.days.length > MAX_DAYS) throw badRequest("too many days", { days: `at most ${MAX_DAYS} days at once` });
    const sessions = input.sessions ?? [];
    if (sessions.length > MAX_SESSIONS) throw badRequest("too many workouts", { sessions: `at most ${MAX_SESSIONS} at once` });
    for (const [i, day] of input.days.entries()) {
      if (!DATE.test(day.date) || Number.isNaN(Date.parse(`${day.date}T00:00:00Z`))) throw badRequest("invalid day", { [`days.${i}.date`]: "a date as YYYY-MM-DD" });
      for (const [key, value] of Object.entries(day.metrics)) {
        if (!isMetric(key)) throw badRequest("invalid metric", { [`days.${i}.metrics.${key}`]: "not a metric Orbis keeps" });
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw badRequest("invalid value", { [`days.${i}.metrics.${key}`]: "a number, 0 or more" });
      }
    }
    for (const [i, session] of sessions.entries()) {
      if (Number.isNaN(Date.parse(session.start)) || Number.isNaN(Date.parse(session.end))) throw badRequest("invalid workout", { [`sessions.${i}`]: "start and end must be dates" });
    }
    const at = nowIso();
    transaction(this.hub.db, () => {
      for (const day of input.days) {
        for (const [key, value] of Object.entries(day.metrics) as Array<[HealthMetric, number]>) {
          exec(
            this.hub.db,
            "INSERT INTO health_metrics (date, metric, value, unit, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(date, metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            day.date,
            key,
            value,
            HEALTH_METRICS[key],
            at,
          );
        }
      }
      for (const s of sessions) {
        exec(
          this.hub.db,
          `INSERT INTO health_sessions (id, start_at, end_at, type, title, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET start_at = excluded.start_at, end_at = excluded.end_at, type = excluded.type, title = excluded.title, source = excluded.source, updated_at = excluded.updated_at`,
          s.id.slice(0, 200),
          new Date(s.start).toISOString(),
          new Date(s.end).toISOString(),
          s.type.slice(0, 60),
          s.title?.slice(0, 200) ?? null,
          s.source?.slice(0, 200) ?? null,
          at,
        );
      }
    });
    const saved = this.saved();
    const sources = [...new Set([...(input.sources ?? []).map((x) => x.slice(0, 200)), ...saved.sources])].slice(0, 30);
    this.settings.set(SETTINGS_KEY, JSON.stringify({ lastSyncAt: at, sources }));
    return this.status();
  }

  /** The bots that may read the health data. */
  readers(): Bot[] {
    return this.hub.repos.bots.list({ includeHidden: true }).filter((bot) => toolAllowed("health.summary", bot.tools, HEALTH_PREFIX));
  }

  status(): HealthStatus {
    const span = get<{ n: number; first: string | null; last: string | null }>(this.hub.db, "SELECT COUNT(DISTINCT date) AS n, MIN(date) AS first, MAX(date) AS last FROM health_metrics");
    const saved = this.saved();
    return {
      lastSyncAt: saved.lastSyncAt,
      days: Number(span?.n ?? 0),
      firstDate: span?.first ?? null,
      lastDate: span?.last ?? null,
      sources: saved.sources,
      bots: this.readers().map((b) => b.id),
    };
  }

  /** The days of the last `days` days that have data, newest first. */
  days(days: number): HealthDay[] {
    const since = new Date(this.clock().getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = all<{ date: string; metric: string; value: number }>(this.hub.db, "SELECT date, metric, value FROM health_metrics WHERE date > ? ORDER BY date DESC", since);
    const byDate = new Map<string, HealthDay>();
    for (const r of rows) {
      if (!isMetric(r.metric)) continue;
      const day = byDate.get(r.date) ?? { date: r.date, metrics: {} };
      day.metrics[r.metric] = r.value;
      byDate.set(r.date, day);
    }
    return [...byDate.values()];
  }

  sessions(days: number): HealthSession[] {
    const since = new Date(this.clock().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    return all<Record<string, string | null>>(this.hub.db, "SELECT * FROM health_sessions WHERE start_at > ? ORDER BY start_at DESC LIMIT 200", since).map((r) => ({
      id: r.id!,
      start: r.start_at!,
      end: r.end_at!,
      type: r.type!,
      title: r.title ?? null,
      source: r.source ?? null,
    }));
  }

  /** Give or take the health data from a bot (`health.*` in its allowlist). */
  setBotAccess(botId: string, on: boolean): Bot {
    const bot = this.hub.botService.get(botId);
    const others = bot.tools.filter((p) => !p.replace(/^!/, "").startsWith(HEALTH_PREFIX));
    const tools = on ? [...(others.length ? others : ["*"]), `${HEALTH_PREFIX}*`] : others.length ? others : ["*"];
    return this.hub.botService.update(bot.id, { tools });
  }

  /** Forget every health value and workout. */
  wipe(): void {
    exec(this.hub.db, "DELETE FROM health_metrics");
    exec(this.hub.db, "DELETE FROM health_sessions");
    this.settings.delete(SETTINGS_KEY);
  }

  /** The days as a table a model reads well: a column per metric that has a value. */
  table(days: HealthDay[], only?: HealthMetric[]): string {
    const used = (Object.keys(HEALTH_METRICS) as HealthMetric[]).filter((m) => (!only?.length || only.includes(m)) && days.some((d) => d.metrics[m] !== undefined));
    if (!used.length) return "";
    const head = `| date | ${used.map((m) => METRIC_NAMES[m]).join(" | ")} |`;
    const rule = `|${" --- |".repeat(used.length + 1)}`;
    const rows = days.map((d) => `| ${d.date} | ${used.map((m) => (d.metrics[m] === undefined ? "—" : shown(m, d.metrics[m]!))).join(" | ")} |`);
    return [head, rule, ...rows].join("\n");
  }

  tools(): ToolDefinition[] {
    return [
      {
        name: "health.summary",
        description:
          "The user's health data from their phone (Health Connect: steps, distance, calories, heart rate, resting heart rate, sleep and its stages, exercise minutes, weight, body fat, blood oxygen), one row per day, newest first.",
        input: Type.Object({
          days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90, description: "How many days back (default 7)" })),
          metrics: Type.Optional(Type.Array(Type.String(), { description: `Only these metrics: ${Object.keys(HEALTH_METRICS).join(", ")}` })),
        }),
        risk: "read",
        explicitPrefix: HEALTH_PREFIX,
        handler: async (input: { days?: number; metrics?: string[] }) => {
          const status = this.status();
          if (!status.days) return "No health data yet: the user connects Health Connect in the Orbis app on their phone (Settings → Health) and syncs.";
          const days = this.days(input.days ?? 7);
          const only = (input.metrics ?? []).filter(isMetric);
          const table = this.table(days, only);
          const synced = `Last synced ${status.lastSyncAt ?? "never"}${status.sources.length ? ` from ${status.sources.join(", ")}` : ""}. Days with data: ${status.firstDate} to ${status.lastDate}.`;
          return table ? `${synced}\n${table}` : `${synced}\nNo values for those days${only.length ? " and metrics" : ""}.`;
        },
      },
      {
        name: "health.sessions",
        description: "The user's workouts from their phone (Health Connect): type, start, end, duration and the app that recorded them, newest first.",
        input: Type.Object({ days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90, description: "How many days back (default 14)" })) }),
        risk: "read",
        explicitPrefix: HEALTH_PREFIX,
        handler: async (input: { days?: number }) => {
          const sessions = this.sessions(input.days ?? 14);
          if (!sessions.length) return "No workouts in those days.";
          return sessions
            .map((s) => {
              const minutes = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000);
              return `- ${s.start} · ${s.type}${s.title ? ` "${s.title}"` : ""} · ${minutes} min${s.source ? ` · ${s.source}` : ""}`;
            })
            .join("\n");
        },
      },
    ];
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const SyncBody = Type.Object(
      {
        days: Type.Array(
          Type.Object({ date: Type.String({ maxLength: 10 }), metrics: Type.Record(Type.String(), Type.Number()) }, { additionalProperties: false }),
          { maxItems: MAX_DAYS },
        ),
        sessions: Type.Optional(
          Type.Array(
            Type.Object(
              {
                id: Type.String({ minLength: 1, maxLength: 200 }),
                start: Type.String({ maxLength: 40 }),
                end: Type.String({ maxLength: 40 }),
                type: Type.String({ maxLength: 60 }),
                title: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
                source: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
              },
              { additionalProperties: false },
            ),
            { maxItems: MAX_SESSIONS },
          ),
        ),
        sources: Type.Optional(Type.Array(Type.String({ maxLength: 200 }), { maxItems: 30 })),
      },
      { additionalProperties: false },
    );
    // The phone's sync carries up to 120 days and their workouts.
    app.put("/api/v1/health/sync", { bodyLimit: 4 * 1024 * 1024, schema: { tags: ["health"], body: SyncBody } }, async (req) => this.sync(req.body as HealthSync));
    app.get("/api/v1/health/status", { schema: { tags: ["health"] } }, async () => this.status());
    app.get(
      "/api/v1/health/summary",
      { schema: { tags: ["health"], querystring: Type.Object({ days: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })) }) } },
      async (req) => ({ days: this.days(req.query.days ?? 7), sessions: this.sessions(req.query.days ?? 7) }),
    );
    app.post(
      "/api/v1/health/bots",
      { schema: { tags: ["health"], body: Type.Object({ botId: Type.String(), enabled: Type.Boolean() }, { additionalProperties: false }) } },
      async (req) => this.setBotAccess(req.body.botId, req.body.enabled),
    );
    app.delete("/api/v1/health", { schema: { tags: ["health"] } }, async (_req, reply) => {
      this.wipe();
      reply.code(204);
      return null;
    });
  }
}
