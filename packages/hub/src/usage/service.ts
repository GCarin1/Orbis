// Usage and spend caps (specs/usage): totals from the runs table, per bot and
// for the account; caps checked before a run starts and after each usage event.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, UsageReport, UsageTotals } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get } from "../db/index.js";
import { badRequest } from "../errors.js";
import type { RunHooks } from "../runs/engine.js";

const usd = (n: number) => `$${n.toFixed(2)}`;
const empty = (): UsageTotals => ({ runs: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscriptionCostUsd: 0 });

/** First instant of the calendar month (UTC) that holds `at`. */
export function monthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export class UsageService {
  constructor(
    private readonly hub: HubContext,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private totals(where: string, ...args: Array<string>): Map<string, UsageTotals> {
    const rows = all(
      this.hub.db,
      `SELECT bot_id, COUNT(*) AS runs, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(cached_tokens) AS cached,
              SUM(cost_usd) AS cost, SUM(CASE WHEN subscription = 1 THEN cost_usd ELSE 0 END) AS sub
         FROM runs WHERE ${where} GROUP BY bot_id`,
      ...args,
    );
    return new Map(
      rows.map((r) => [
        r.bot_id as string,
        {
          runs: Number(r.runs ?? 0),
          inputTokens: Number(r.input ?? 0),
          outputTokens: Number(r.output ?? 0),
          cachedTokens: Number(r.cached ?? 0),
          costUsd: Number(r.cost ?? 0),
          subscriptionCostUsd: Number(r.sub ?? 0),
        },
      ]),
    );
  }

  /** The cost that counts toward a cap: API cost, plus subscription cost when the bot says so. */
  capped(bot: Pick<Bot, "capIncludesSubscription">, totals: UsageTotals): number {
    return totals.costUsd - (bot.capIncludesSubscription ? 0 : totals.subscriptionCostUsd);
  }

  /** Month-to-date capped cost of one bot (UTC calendar month). */
  monthToDate(bot: Bot, at = this.now()): number {
    const row = get(
      this.hub.db,
      `SELECT SUM(cost_usd) AS cost, SUM(CASE WHEN subscription = 1 THEN cost_usd ELSE 0 END) AS sub FROM runs WHERE bot_id = ? AND created_at >= ?`,
      bot.id,
      monthStart(at).toISOString(),
    );
    return this.capped(bot, { ...empty(), costUsd: Number(row?.cost ?? 0), subscriptionCostUsd: Number(row?.sub ?? 0) });
  }

  report(opts: { from?: string; to?: string; botId?: string } = {}): UsageReport {
    const now = this.now();
    const from = opts.from ? new Date(opts.from) : monthStart(now);
    const to = opts.to ? new Date(opts.to) : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    if (Number.isNaN(from.getTime())) throw badRequest("invalid range", { from: "must be an ISO date" });
    if (Number.isNaN(to.getTime())) throw badRequest("invalid range", { to: "must be an ISO date" });
    if (to <= from) throw badRequest("invalid range", { to: "must be after from" });
    const bot = opts.botId ? this.hub.botService.get(opts.botId) : null;
    const where = bot ? "created_at >= ? AND created_at < ? AND bot_id = ?" : "created_at >= ? AND created_at < ?";
    const byBot = this.totals(where, from.toISOString(), to.toISOString(), ...(bot ? [bot.id] : []));
    const bots = bot ? [bot] : this.hub.repos.bots.list({ includeHidden: true });
    const total = empty();
    const rows = bots
      .map((b) => {
        const usage = byBot.get(b.id) ?? empty();
        for (const key of Object.keys(total) as Array<keyof UsageTotals>) total[key] += usage[key];
        return { botId: b.id, usage, spendCapUsd: b.spendCapUsd, capIncludesSubscription: b.capIncludesSubscription, cappedCostUsd: this.capped(b, usage) };
      })
      .sort((a, b) => b.usage.costUsd - a.usage.costUsd || b.usage.runs - a.usage.runs);
    total.costUsd = Math.round(total.costUsd * 1e6) / 1e6;
    total.subscriptionCostUsd = Math.round(total.subscriptionCostUsd * 1e6) / 1e6;
    return { from: from.toISOString(), to: to.toISOString(), total, bots: rows };
  }

  hooks(): RunHooks {
    return {
      beforeStart: (_run, bot) => {
        if (bot.spendCapUsd === null) return null;
        const spent = this.monthToDate(bot);
        if (spent < bot.spendCapUsd) return null;
        return `spend cap reached: ${usd(spent)} of ${usd(bot.spendCapUsd)} this month (UTC); raise the cap or wait for next month`;
      },
      afterUsage: (_run, bot) => {
        if (bot.spendCapUsd === null) return null;
        const spent = this.monthToDate(bot);
        if (spent <= bot.spendCapUsd) return null;
        return `stopped: this run took the month to ${usd(spent)}, over the spend cap of ${usd(bot.spendCapUsd)}`;
      },
    };
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Query = Type.Object({ from: Type.Optional(Type.String()), to: Type.Optional(Type.String()), botId: Type.Optional(Type.String()) });
    app.get("/api/v1/usage", { schema: { tags: ["usage"], querystring: Query } }, async (req) => this.report(req.query));
  }
}
