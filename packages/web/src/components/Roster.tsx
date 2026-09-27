// The sidebar roster: organised around bots, not conversations (specs/web-app).
import type { Bot } from "@orbis/shared";
import { useLang, useT } from "../i18n.js";
import { Avatar, StateLabel } from "./Avatar.js";

export interface RosterGroup {
  key: string;
  title: string;
  bots: Bot[];
}

/** Pinned bots first, then one group per role (alphabetical), bots by recent activity. */
export function groupRoster(bots: Bot[], labels: { pinned: string; noRole: string }): RosterGroup[] {
  const visible = bots.filter((b) => !b.hidden);
  const byActivity = (a: Bot, b: Bot) =>
    (b.lastMessage?.at ?? "").localeCompare(a.lastMessage?.at ?? "") || a.name.localeCompare(b.name);
  const groups: RosterGroup[] = [];
  const pinned = visible.filter((b) => b.pinned).sort(byActivity);
  if (pinned.length) groups.push({ key: "__pinned", title: labels.pinned, bots: pinned });
  const byRole = new Map<string, Bot[]>();
  for (const bot of visible.filter((b) => !b.pinned)) {
    const role = bot.role.trim();
    byRole.set(role, [...(byRole.get(role) ?? []), bot]);
  }
  const roles = [...byRole.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  for (const role of roles) {
    groups.push({ key: `role:${role}`, title: role || labels.noRole, bots: byRole.get(role)!.sort(byActivity) });
  }
  return groups;
}

function timeOf(iso: string, lang: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(lang, { day: "2-digit", month: "short" });
}

export function Roster({
  bots,
  selectedId,
  onSelect,
  onNew,
}: {
  bots: Bot[];
  selectedId: string | null;
  onSelect(id: string): void;
  onNew(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const groups = groupRoster(bots, { pinned: t("roster.pinned"), noRole: t("roster.noRole") });
  return (
    <nav className="roster" aria-label={t("roster.title")}>
      <div className="roster-head">
        <h2>{t("roster.title")}</h2>
        <button className="btn btn-primary" onClick={onNew}>
          + {t("roster.new")}
        </button>
      </div>
      {groups.length === 0 && <p className="muted roster-empty">{t("roster.empty")}</p>}
      {groups.map((group) => (
        <section key={group.key} className="roster-group" data-testid={`group-${group.key}`}>
          <h3>{group.title}</h3>
          <ul>
            {group.bots.map((bot) => (
              <li key={bot.id}>
                <button
                  className={`roster-item${bot.id === selectedId ? " selected" : ""}`}
                  onClick={() => onSelect(bot.id)}
                  data-testid={`bot-${bot.handle}`}
                >
                  <Avatar bot={bot} />
                  <span className="roster-text">
                    <span className="roster-line">
                      <strong>{bot.name}</strong>
                      {bot.lastMessage && <time className="muted">{timeOf(bot.lastMessage.at, lang)}</time>}
                    </span>
                    <span className="roster-line">
                      <StateLabel state={bot.state} />
                    </span>
                    {bot.lastMessage && <span className="roster-last muted">{bot.lastMessage.text}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
