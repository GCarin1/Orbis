// Usage screen: runs, tokens and cost per bot, spend caps (specs/usage, specs/web-app).
import { useEffect, useState } from "react";
import type { Bot, UsageReport } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";
import { Avatar } from "./Avatar.js";

const usd = (n: number) => `$${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function UsageScreen({ api, bots }: { api: Api; bots: Record<string, Bot> }) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <table className="usage-table">
            <thead>
              <tr>
                <th scope="col">{t("usage.bot")}</th>
                <th scope="col">{t("usage.runs")}</th>
                <th scope="col">{t("usage.tokens")}</th>
                <th scope="col">{t("usage.cost")}</th>
                <th scope="col">{t("usage.subscription")}</th>
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
                    <td>
                      {tokens(row.usage.inputTokens)} / {tokens(row.usage.outputTokens)}
                    </td>
                    <td>{usd(row.usage.costUsd)}</td>
                    <td>{row.usage.subscriptionCostUsd > 0 ? usd(row.usage.subscriptionCostUsd) : "—"}</td>
                    <td>
                      {row.spendCapUsd === null ? (
                        <span className="muted">{t("usage.noCap")}</span>
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
                <td>
                  {tokens(report.total.inputTokens)} / {tokens(report.total.outputTokens)}
                </td>
                <td>{usd(report.total.costUsd)}</td>
                <td>{report.total.subscriptionCostUsd > 0 ? usd(report.total.subscriptionCostUsd) : "—"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
