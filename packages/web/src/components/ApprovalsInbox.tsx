// Every pending approval across bots, answerable without opening the conversation.
import type { Approval, Bot } from "@orbis/shared";
import { useT } from "../i18n.js";
import { useStore } from "../store.js";

/** One line saying what an approval would do: the command, the file, the address. */
export function approvalSummary(input: unknown): string {
  const value =
    (input as { input?: unknown })?.input && typeof (input as { claudeTool?: unknown }).claudeTool === "string" ? (input as { input: unknown }).input : input;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["command", "path", "file_path", "url", "to", "name", "query"]) {
      if (typeof o[key] === "string" && o[key]) return String(o[key]).replace(/\s+/g, " ").slice(0, 120);
    }
  }
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return text.slice(0, 120);
}

export function ApprovalsInbox({ approvals, bots, onOpen }: { approvals: Approval[]; bots: Record<string, Bot>; onOpen(approval: Approval): void }) {
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
              <div className="inbox-what muted" data-testid="inbox-what">
                {approvalSummary(a.input)}
              </div>
              <div className="card-actions">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    void useStore
                      .getState()
                      .answerApproval(a.id, "allow_once")
                      .catch(() => undefined)
                  }
                >
                  {t("approval.once")}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() =>
                    void useStore
                      .getState()
                      .answerApproval(a.id, "deny")
                      .catch(() => undefined)
                  }
                >
                  {t("approval.deny")}
                </button>
                <button className="link" onClick={() => onOpen(a)}>
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
