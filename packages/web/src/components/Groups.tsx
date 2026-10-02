// The dialog that creates a group conversation (specs/web-app, specs/conversations).
import { useState } from "react";
import type { Bot, Conversation } from "@orbis/shared";
import { useT } from "../i18n.js";
import { Avatar } from "./Avatar.js";

/** The hub's default ORBIS_MAX_GROUP_SIZE, until it says its own. */
export const MAX_GROUP_SIZE = 6;

export interface NewGroupInput {
  title: string;
  members: string[];
  leadBotId?: string;
}

export function NewGroupDialog({
  bots,
  onCreate,
  onCancel,
  maxGroupSize = MAX_GROUP_SIZE,
}: {
  bots: Bot[];
  /** How many bots a group holds (the hub's ORBIS_MAX_GROUP_SIZE). */
  maxGroupSize?: number;
  onCreate(input: NewGroupInput): Promise<void>;
  onCancel(): void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [lead, setLead] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const candidates = bots.filter((b) => !b.hidden).sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (id: string) =>
    setMembers((current) => (current.includes(id) ? current.filter((m) => m !== id) : current.length >= maxGroupSize ? current : [...current, id]));
  const leadId = members.includes(lead) ? lead : (members[0] ?? "");
  const valid = title.trim().length > 0 && members.length >= 2 && members.length <= maxGroupSize;

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newgroup-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          setError(null);
          try {
            await onCreate({ title: title.trim(), members, ...(leadId ? { leadBotId: leadId } : {}) });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="newgroup-title">{t("newgroup.title")}</h2>
        <label>
          {t("newgroup.name")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} autoFocus name="title" />
        </label>
        <fieldset className="member-picker">
          <legend>
            {t("newgroup.members", { max: maxGroupSize })} <span className="muted">— {t("newgroup.count", { count: members.length, max: maxGroupSize })}</span>
          </legend>
          {candidates.map((bot) => {
            const checked = members.includes(bot.id);
            return (
              <label key={bot.id} className="member-option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && members.length >= maxGroupSize}
                  onChange={() => toggle(bot.id)}
                  name={`member-${bot.handle}`}
                />
                <Avatar bot={bot} size={22} />
                <span>
                  {bot.name} <span className="muted">@{bot.handle}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {members.length >= 2 && (
          <label>
            {t("newgroup.lead")}
            <select value={leadId} onChange={(e) => setLead(e.target.value)} name="lead">
              {members.map((id) => {
                const bot = bots.find((b) => b.id === id);
                return (
                  <option key={id} value={id}>
                    {bot?.name ?? id}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("newbot.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
            {t("newgroup.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
