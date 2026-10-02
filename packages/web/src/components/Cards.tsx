// Structured cards inside the timeline: approvals, drafts and handoffs
// (specs/approvals, specs/handoff, specs/web-app).
import { useState } from "react";
import type { Bot, DraftFields, HandoffCardData, TimelineItem } from "@orbis/shared";
import { useT, type TextKey } from "../i18n.js";
import { useStore } from "../store.js";
import { Avatar } from "./Avatar.js";

function Pretty({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="card-input">{text}</pre>;
}

export function ApprovalCard({ item, bot }: { item: TimelineItem; bot?: Bot }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = item.card!.data as { approvalId: string; tool: string; input: unknown; reason?: string | null; locked?: boolean; note?: string | null };
  const state = item.card!.state;
  const answer = async (decision: "allow_once" | "allow_always" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      await useStore.getState().answerApproval(data.approvalId, decision, decision === "deny" ? note : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      {error && <p className="error">{error}</p>}
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
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof fields) => (e: { target: { value: string } }) => setFields({ ...fields, [key]: e.target.value });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      {error && <p className="error">{error}</p>}
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

export function HandoffCard({ item, bots }: { item: TimelineItem; bots: Record<string, Bot> }) {
  const t = useT();
  const data = item.card!.data as HandoffCardData;
  const state = item.card!.state;
  const from = bots[data.from];
  const to = bots[data.to];
  const name = (bot: Bot | undefined) => (bot ? `@${bot.handle}` : "?");
  return (
    <div className={`card card-handoff card-${state}`} data-testid="handoff-card">
      <span className="handoff-route" aria-hidden="true">
        {from && <Avatar bot={from} size={22} />}
        <span className="handoff-arrow">→</span>
        {to && <Avatar bot={to} size={22} />}
      </span>
      <div className="handoff-body">
        <div className="handoff-line">
          <strong>{t("handoff.title", { from: name(from), to: name(to) })}</strong>
          <span className={`pill pill-${state}`}>{t(`handoff.state.${state}` as TextKey)}</span>
        </div>
        <p className="handoff-task">{data.task}</p>
        {data.context && (
          <details>
            <summary>{t("handoff.context")}</summary>
            <p className="handoff-context">{data.context}</p>
          </details>
        )}
        {data.returnResult && <p className="handoff-returns">{t("handoff.returns", { from: name(from) })}</p>}
        {state === "failed" && data.error && <p className="error">{data.error}</p>}
      </div>
    </div>
  );
}

/** A bot asks for a secret: a masked field that posts straight to the vault (specs/secrets). */
export function SecretRequestCard({ item, bot }: { item: TimelineItem; bot?: Bot }) {
  const t = useT();
  const data = item.card!.data as { name: string; reason: string };
  const state = item.card!.state;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (body: { value: string } | { decline: true }) => {
    setBusy(true);
    setError(null);
    try {
      await useStore.getState().answerSecret(item.id, body);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`card card-secret card-${state}`} data-testid="secret-card">
      <div className="card-head">
        <strong>🔑 {t("secret.asks", { name: bot?.name ?? "bot", secret: data.name })}</strong>
        <span className={`pill pill-${state === "fulfilled" ? "approved" : state}`}>{t(`secret.state.${state}` as TextKey)}</span>
      </div>
      <p className="muted">{data.reason}</p>
      {state === "pending" && (
        <form
          className="card-actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) void answer({ value });
          }}
        >
          <input
            className="card-note"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("secret.placeholder")}
            aria-label={t("secret.placeholder")}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !value}>
            {t("secret.submit")}
          </button>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void answer({ decline: true })}>
            {t("secret.decline")}
          </button>
        </form>
      )}
      <p className="muted secret-note">{t("secret.note", { secret: data.name })}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function RoutineCard({ item }: { item: TimelineItem }) {
  const t = useT();
  const state = item.card!.state;
  return (
    <div className={`card card-routine card-${state}`} data-testid="routine-card">
      <div className="card-head">
        <strong>⏰ {item.text}</strong>
        <span className={`pill pill-routine-${state}`}>{t(`routine.card.${state}` as TextKey)}</span>
      </div>
    </div>
  );
}

export function CardView({ item, bot, bots = {} }: { item: TimelineItem; bot?: Bot; bots?: Record<string, Bot> }) {
  switch (item.card?.type) {
    case "approval":
      return <ApprovalCard item={item} bot={bot} />;
    case "draft":
      return <DraftCard item={item} bot={bot} />;
    case "handoff":
      return <HandoffCard item={item} bots={bots} />;
    case "routine":
      return <RoutineCard item={item} />;
    case "secret-request":
      return <SecretRequestCard item={item} bot={bot} />;
    default:
      return (
        <div className={`card card-${item.card?.type}`} data-testid="card">
          <strong>{item.card?.type}</strong> {item.text}
        </div>
      );
  }
}
