// Group conversations in the sidebar and the dialog that creates one (specs/web-app, specs/conversations).
import { useState } from "react";
import type { Bot, Conversation } from "@orbis/shared";
import { useT } from "../i18n.js";
import { Avatar } from "./Avatar.js";

export const MAX_GROUP_SIZE = 6;

export function GroupList({
  groups,
  bots,
  selectedId,
  onSelect,
  onNew,
}: {
  groups: Conversation[];
  bots: Record<string, Bot>;
  selectedId: string | null;
  onSelect(id: string): void;
  onNew(): void;
}) {
  const t = useT();
  const sorted = [...groups].sort((a, b) => (b.lastItemAt ?? b.createdAt).localeCompare(a.lastItemAt ?? a.createdAt));
  return (
    <nav className="groups" aria-label={t("groups.title")}>
      <div className="roster-head">
        <h2>{t("groups.title")}</h2>
        <button className="btn" onClick={onNew}>
          + {t("groups.new")}
        </button>
      </div>
      {sorted.length === 0 && <p className="muted roster-empty">{t("groups.empty")}</p>}
      <ul>
        {sorted.map((group) => (
          <li key={group.id}>
            <button
              className={`roster-item${group.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(group.id)}
              data-testid={`conv-${group.id}`}
            >
              <span className="avatar-stack" aria-hidden="true">
                {group.members.slice(0, 3).map((id) => (bots[id] ? <Avatar key={id} bot={bots[id]!} size={22} /> : null))}
              </span>
              <span className="roster-text">
                <strong>{group.title}</strong>
                <span className="muted">{group.members.map((id) => `@${bots[id]?.handle ?? "?"}`).join(" ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface NewGroupInput {
  title: string;
  members: string[];
  leadBotId?: string;
}

export function NewGroupDialog({
  bots,
  onCreate,
  onCancel,
}: {
  bots: Bot[];
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
    setMembers((current) => (current.includes(id) ? current.filter((m) => m !== id) : current.length >= MAX_GROUP_SIZE ? current : [...current, id]));
  const leadId = members.includes(lead) ? lead : (members[0] ?? "");
  const valid = title.trim().length > 0 && members.length >= 2 && members.length <= MAX_GROUP_SIZE;

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
            {t("newgroup.members")} <span className="muted">— {t("newgroup.count", { count: members.length })}</span>
          </legend>
          {candidates.map((bot) => {
            const checked = members.includes(bot.id);
            return (
              <label key={bot.id} className="member-option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && members.length >= MAX_GROUP_SIZE}
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
