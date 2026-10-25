// Usage screen: three headline numbers, then runs and cost per bot and spend caps; money in the user's own
// format, tokens a tap away (specs/usage, specs/web-app, change 0098).
import { useEffect, useState } from "react";
import type { Bot, UsageReport } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { Avatar } from "./Avatar.js";

/** Dollars as the user writes money: "US$ 3,00" in Portuguese, "$3.00" in English; a few cents keep 4 digits. */
export function money(n: number, lang: string): string {
  const digits = n > 0 && n < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(lang, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function UsageScreen({ api, bots, onSetCap }: { api: Api; bots: Record<string, Bot>; onSetCap?(botId: string): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const usd = (n: number) => money(n, lang);

  useEffect(() => {
    const { from, to } = monthRange(offset);
    let live = true;
    api
      .get<UsageReport>(`/api/v1/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => live && setReport(r))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [api, offset]);

  // The bot that spent the most, or, when nothing was spent, the one that worked the most.
  const top = report?.bots.reduce<UsageReport["bots"][number] | null>((best, row) => {
    if (!best) return row;
    const key = (r: typeof row) => [r.usage.costUsd + r.usage.subscriptionCostUsd, r.usage.runs];
    const [a, b] = [key(row), key(best)];
    return a[0]! > b[0]! || (a[0] === b[0] && a[1]! > b[1]!) ? row : best;
  }, null);
  const topBot = top && top.usage.runs > 0 ? bots[top.botId] : undefined;
  const subscription = report ? report.total.subscriptionCostUsd > 0 : false;

  return (
    <section className="screen" aria-labelledby="usage-title" data-testid="usage-screen">
      <header className="screen-head">
        <h1 id="usage-title">{t("usage.title")}</h1>
        <p className="muted">{t("usage.help")}</p>
        <div className="card-actions">
          <button className={`btn${offset === 0 ? " btn-primary" : ""}`} aria-pressed={offset === 0} onClick={() => setOffset(0)}>
            {t("usage.thisMonth")}
          </button>
          <button className={`btn${offset === -1 ? " btn-primary" : ""}`} aria-pressed={offset === -1} onClick={() => setOffset(-1)}>
            {t("usage.lastMonth")}
          </button>
        </div>
      </header>
      <div className="screen-body">
        {error && <p className="error">{error}</p>}
        {report && (
          <>
            <dl className="usage-stats" data-testid="usage-stats">
              <div className="usage-stat">
                <dt>{t("usage.statCost")}</dt>
                <dd>{usd(report.total.costUsd + report.total.subscriptionCostUsd)}</dd>
              </div>
              <div className="usage-stat">
                <dt>{t("usage.runs")}</dt>
                <dd>{report.total.runs.toLocaleString(lang)}</dd>
              </div>
              <div className="usage-stat">
                <dt>{t("usage.statTop")}</dt>
                <dd>
                  {topBot ? (
                    <span className="usage-bot">
                      <Avatar bot={topBot} size={24} />
                      {topBot.name}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <div className="table-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th scope="col">{t("usage.bot")}</th>
                    <th scope="col">{t("usage.runs")}</th>
                    {showTokens && <th scope="col">{t("usage.tokens")}</th>}
                    <th scope="col">{t("usage.cost")}</th>
                    {subscription && <th scope="col">{t("usage.subscription")}</th>}
                    <th scope="col">{t("usage.cap")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bots.map((row) => {
                    const bot = bots[row.botId];
                    const share = row.spendCapUsd ? Math.min(1, row.cappedCostUsd / row.spendCapUsd) : 0;
                    const reached = row.spendCapUsd !== null && row.cappedCostUsd >= row.spendCapUsd;
                    return (
                      <tr key={row.botId} data-testid={`usage-${bot?.handle ?? row.botId}`}>
                        <th scope="row">
                          <span className="usage-bot">
                            {bot && <Avatar bot={bot} size={24} />}
                            {bot ? bot.name : row.botId}
                          </span>
                        </th>
                        <td>{row.usage.runs}</td>
                        {showTokens && (
                          <td>
                            {tokens(row.usage.inputTokens)} / {tokens(row.usage.outputTokens)}
                          </td>
                        )}
                        <td>{usd(row.usage.costUsd)}</td>
                        {subscription && <td>{row.usage.subscriptionCostUsd > 0 ? usd(row.usage.subscriptionCostUsd) : ""}</td>}
                        <td>
                          {row.spendCapUsd === null ? (
                            onSetCap && bot ? (
                              <button type="button" className="link" onClick={() => onSetCap(row.botId)}>
                                {t("usage.setCap")}
                              </button>
                            ) : (
                              <span className="muted">{t("usage.noCap")}</span>
                            )
                          ) : (
                            <span className="cap">
                              <span
                                className={`cap-bar${reached ? " reached" : ""}`}
                                role="meter"
                                aria-valuemin={0}
                                aria-valuemax={row.spendCapUsd}
                                aria-valuenow={row.cappedCostUsd}
                                aria-label={t("usage.cap")}
                              >
                                <span style={{ width: `${share * 100}%` }} />
                              </span>
                              {usd(row.cappedCostUsd)} / {usd(row.spendCapUsd)}
                              {reached && <strong className="cap-reached"> {t("usage.reached")}</strong>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t("usage.total")}</th>
                    <td>{report.total.runs}</td>
                    {showTokens && (
                      <td>
                        {tokens(report.total.inputTokens)} / {tokens(report.total.outputTokens)}
                      </td>
                    )}
                    <td>{usd(report.total.costUsd)}</td>
                    {subscription && <td>{usd(report.total.subscriptionCostUsd)}</td>}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button type="button" className="link usage-tokens-toggle" aria-pressed={showTokens} onClick={() => setShowTokens(!showTokens)}>
              {t(showTokens ? "usage.hideTokens" : "usage.showTokens")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
