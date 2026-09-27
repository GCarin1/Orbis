// Every pending approval across bots, answerable without opening the conversation.
import type { Approval, Bot } from "@orbis/shared";
import { useT } from "../i18n.js";
import { useStore } from "../store.js";

export function ApprovalsInbox({ approvals, bots, onOpen }: { approvals: Approval[]; bots: Record<string, Bot>; onOpen(botId: string): void }) {
  const t = useT();
  const pending = approvals.filter((a) => a.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section className="inbox" aria-label={t("inbox.title")}>
      <h3>
        {t("inbox.title")} {pending.length > 0 && <span className="count">{pending.length}</span>}
      </h3>
      {pending.length === 0 && <p className="muted inbox-empty">{t("inbox.empty")}</p>}
      <ul>
        {pending.map((a) => {
          const bot = bots[a.botId];
          return (
            <li key={a.id} className="inbox-item" data-testid="inbox-item">
              <div>
                <strong>@{bot?.handle ?? "bot"}</strong> → <code>{a.tool}</code>
              </div>
              <div className="card-actions">
                <button className="btn btn-primary" onClick={() => void useStore.getState().answerApproval(a.id, "allow_once")}>
                  {t("approval.once")}
                </button>
                <button className="btn btn-danger" onClick={() => void useStore.getState().answerApproval(a.id, "deny")}>
                  {t("approval.deny")}
                </button>
                <button className="link" onClick={() => onOpen(a.botId)}>
                  {t("inbox.open")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
