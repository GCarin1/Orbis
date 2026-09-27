// Structured cards inside the timeline: approvals and drafts (specs/approvals, specs/web-app).
import { useState } from "react";
import type { Bot, DraftFields, TimelineItem } from "@orbis/shared";
import { useT, type TextKey } from "../i18n.js";
import { useStore } from "../store.js";

function Pretty({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="card-input">{text}</pre>;
}

export function ApprovalCard({ item, bot }: { item: TimelineItem; bot?: Bot }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const data = item.card!.data as { approvalId: string; tool: string; input: unknown; reason?: string | null; locked?: boolean; note?: string | null };
  const state = item.card!.state;
  const answer = async (decision: "allow_once" | "allow_always" | "deny") => {
    setBusy(true);
    try {
      await useStore.getState().answerApproval(data.approvalId, decision, decision === "deny" ? note : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`card card-approval card-${state}`} data-testid="approval-card">
      <div className="card-head">
        <strong>{t("approval.asks", { name: bot?.name ?? "bot", tool: data.tool })}</strong>
        <span className={`pill pill-${state}`}>{t(`approval.state.${state}` as TextKey)}</span>
      </div>
      {data.reason && <p className="muted">{t("approval.reason", { reason: data.reason })}</p>}
      {data.locked && <p className="muted">🔒 {t("approval.locked")}</p>}
      <Pretty value={data.input} />
      {state === "pending" && (
        <>
          <input className="card-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("approval.notePlaceholder")} aria-label={t("approval.notePlaceholder")} />
          <div className="card-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void answer("allow_once")}>
              {t("approval.once")}
            </button>
            {!data.locked && (
              <button className="btn" disabled={busy} onClick={() => void answer("allow_always")}>
                {t("approval.always")}
              </button>
            )}
            <button className="btn btn-danger" disabled={busy} onClick={() => void answer("deny")}>
              {t("approval.deny")}
            </button>
          </div>
        </>
      )}
      {state === "denied" && data.note && <p className="muted">“{data.note}”</p>}
    </div>
  );
}

export function DraftCard({ item, bot }: { item: TimelineItem; bot?: Bot }) {
  const t = useT();
  const data = item.card!.data as unknown as DraftFields & { delivery?: { detail: string; ok: boolean } };
  const state = item.card!.state;
  const editable = state === "pending" || state === "failed";
  const [fields, setFields] = useState({ to: data.to, subject: data.subject ?? "", body: data.body, url: data.url ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof fields) => (e: { target: { value: string } }) => setFields({ ...fields, [key]: e.target.value });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`card card-draft card-${state}`} data-testid="draft-card">
      <div className="card-head">
        <strong>{t("draft.title", { name: bot?.name ?? "bot", channel: data.channel })}</strong>
        <span className={`pill pill-${state}`}>{t(`draft.state.${state}` as TextKey)}</span>
      </div>
      <div className="draft-fields">
        <label>
          {t("draft.to")}
          <input value={fields.to} onChange={set("to")} disabled={!editable} />
        </label>
        {(data.channel === "email" || data.subject) && (
          <label>
            {t("draft.subject")}
            <input value={fields.subject} onChange={set("subject")} disabled={!editable} />
          </label>
        )}
        {data.channel === "webhook" && (
          <label>
            {t("draft.url")}
            <input value={fields.url} onChange={set("url")} disabled={!editable} />
          </label>
        )}
        <label>
          {t("draft.body")}
          <textarea value={fields.body} onChange={set("body")} disabled={!editable} rows={Math.min(12, fields.body.split("\n").length + 1)} />
        </label>
      </div>
      {data.delivery && <p className="muted">{data.delivery.detail}</p>}
      {editable && (
        <div className="card-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void run(() =>
                useStore.getState().sendDraft(item.id, {
                  to: fields.to,
                  body: fields.body,
                  ...(fields.subject ? { subject: fields.subject } : {}),
                  ...(data.channel === "webhook" ? { url: fields.url } : {}),
                }),
              )
            }
          >
            {t("draft.send")}
          </button>
          <button className="btn" disabled={busy} onClick={() => void run(() => useStore.getState().discardDraft(item.id))}>
            {t("draft.discard")}
          </button>
        </div>
      )}
    </div>
  );
}

export function CardView({ item, bot }: { item: TimelineItem; bot?: Bot }) {
  switch (item.card?.type) {
    case "approval":
      return <ApprovalCard item={item} bot={bot} />;
    case "draft":
      return <DraftCard item={item} bot={bot} />;
    default:
      return (
        <div className={`card card-${item.card?.type}`} data-testid="card">
          <strong>{item.card?.type}</strong> {item.text}
        </div>
      );
  }
}
