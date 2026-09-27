// `orbis usage [@bot] [--from DATE] [--to DATE]` — tokens and cost per bot (specs/usage).
import { parseArgs } from "node:util";
import type { Bot, UsageReport, UsageTotals } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { json, out, paint } from "../io.js";

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const usd = (n: number) => `$${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;

function line(u: UsageTotals): string {
  const sub = u.subscriptionCostUsd > 0 ? ` (subscription ${usd(u.subscriptionCostUsd)})` : "";
  return `${u.runs} runs  ${tokens(u.inputTokens)} in / ${tokens(u.outputTokens)} out${u.cachedTokens ? ` / ${tokens(u.cachedTokens)} cached` : ""}  ${usd(u.costUsd)}${sub}`;
}

export async function usageCommand(args: string[], ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { from: { type: "string" }, to: { type: "string" } }, strict: true });
  const client = ctx.client();
  const c = paint(ctx.io);
  const query = new URLSearchParams();
  if (values.from) query.set("from", values.from);
  if (values.to) query.set("to", values.to);
  if (positionals[0]) query.set("botId", positionals[0].replace(/^@/, ""));
  const report = await client.get<UsageReport>(`/api/v1/usage${query.size ? `?${query}` : ""}`);
  if (ctx.json) return json(ctx.io, report), 0;
  const bots = new Map((await client.get<Bot[]>("/api/v1/bots?includeHidden=true")).map((b) => [b.id, b]));
  out(ctx.io, c.bold(`Usage ${report.from.slice(0, 10)} → ${report.to.slice(0, 10)} (UTC)`));
  for (const b of report.bots) {
    if (b.usage.runs === 0 && b.spendCapUsd === null) continue;
    const cap = b.spendCapUsd !== null ? `  cap ${usd(b.spendCapUsd)}: ${usd(b.cappedCostUsd)} used${b.cappedCostUsd >= b.spendCapUsd ? c.red(" — reached") : ""}` : "";
    out(ctx.io, `  @${bots.get(b.botId)?.handle ?? b.botId}  ${line(b.usage)}${cap}`);
  }
  out(ctx.io, `  ${c.bold("total")}  ${line(report.total)}`);
  return 0;
}
