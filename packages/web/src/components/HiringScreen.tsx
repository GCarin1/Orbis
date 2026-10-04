// Hiring (specs/hiring): ask a bot's brain for short résumés of AI teammates, for a project or one of your
// groups, then hire only the ones you want. Only a hire makes the brain write the full profile
// (instructions, tools, skills, what it will do and needs), which becomes a bot that says hello.
import { useEffect, useMemo, useState } from "react";
import { colorFor, initialsOf, shapeFor, type Bot, type Candidate, type Conversation, type HiringRound, type HiringTool } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { Avatar, botLabel } from "./Avatar.js";
import { brainLabel } from "./brains.js";
import { McpLogo } from "./McpLogo.js";
import { Sheet } from "./Sheet.js";

/** Output tokens a résumé takes, about: one line of JSON. */
export const TOKENS_PER_RESUME = 70;
/** Output tokens a full profile takes, about. */
export const TOKENS_PER_PROFILE = 800;
const QUICK = [5, 10, 20];
const BRIEF_KEY = "orbis.hiring.brief";
const RECRUITER_KEY = "orbis.hiring.recruiter";

const remembered = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const remember = (key: string, value: string) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* no storage */
  }
};

/** The bot a recruiter is likely to be: the one the user picked last, one whose role says so, or the first. */
export function defaultRecruiter(bots: Bot[], last: string): string {
  if (bots.some((b) => b.id === last)) return last;
  return (bots.find((b) => /\b(rh|hr|recrut|recruit|people|talent)/i.test(`${b.role} ${b.name}`)) ?? bots[0])?.id ?? "";
}

/** A candidate's face: the one the bot gets when hired. */
const face = (c: Candidate) => ({
  name: c.name,
  state: "idle" as const,
  avatar: { initials: initialsOf(c.name), color: colorFor(c.role || c.name), shape: shapeFor(c.name) },
});

const ORBIS_ICONS: Record<string, string> = { computer: "🖥️", browser: "🌐", web: "🔎" };

function ToolChip({ id, tools }: { id: string; tools: Map<string, HiringTool> }) {
  const tool = tools.get(id);
  const name = tool?.name ?? id.replace(/^mcp\./, "");
  return (
    <span className="hire-tool" title={tool?.description ?? name}>
      {id.startsWith("mcp.") ? <McpLogo logo={tool?.logo} icon="🧩" size={18} /> : <span aria-hidden="true">{ORBIS_ICONS[id] ?? "🔧"}</span>}
      {name}
    </span>
  );
}

function NewRound({ api, bots, groups }: { api: Api; bots: Bot[]; groups: Conversation[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [basis, setBasis] = useState<"project" | "team">("project");
  const [brief, setBrief] = useState(() => remembered(BRIEF_KEY));
  const [focus, setFocus] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [count, setCount] = useState(10);
  const [recruiterId, setRecruiterId] = useState(() => defaultRecruiter(bots, remembered(RECRUITER_KEY)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);
  useEffect(() => {
    if (!bots.some((b) => b.id === recruiterId)) setRecruiterId(defaultRecruiter(bots, remembered(RECRUITER_KEY)));
  }, [bots, recruiterId]);

  if (bots.length === 0) return <p className="notice">{t("hiring.noBots")}</p>;
  const ready = Boolean(recruiterId) && (basis === "project" ? brief.trim() !== "" : groupId !== "");
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      remember(RECRUITER_KEY, recruiterId);
      if (basis === "project") remember(BRIEF_KEY, brief);
      await api.post("/api/v1/hiring/rounds", {
        basis,
        ...(basis === "project" ? { brief } : { groupId, ...(focus.trim() ? { brief: focus } : {}) }),
        recruiterId,
        count,
        lang,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="hire-new prefs-form"
      data-testid="hiring-new"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>{t("hiring.newTitle")}</h2>
      <div className="segmented" role="radiogroup" aria-label={t("hiring.basis")}>
        {(["project", "team"] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={basis === b} className={basis === b ? "on" : ""} onClick={() => setBasis(b)}>
            {t(b === "project" ? "hiring.basis.project" : "hiring.basis.team")}
          </button>
        ))}
      </div>
      {basis === "project" ? (
        <label>
          {t("hiring.brief")}
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={t("hiring.briefPlaceholder")}
            name="brief"
          />
        </label>
      ) : groups.length === 0 ? (
        <p className="muted">{t("hiring.noGroups")}</p>
      ) : (
        <>
          <label>
            {t("hiring.group")}
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} name="group">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <span className="muted small">{t("hiring.groupHelp")}</span>
          </label>
          <label>
            {t("hiring.focus")}
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              maxLength={1500}
              placeholder={t("hiring.focusPlaceholder")}
              name="focus"
            />
          </label>
        </>
      )}
      <div className="hire-row">
        <label className="hire-count">
          {t("hiring.count")}
          <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} name="count" />
        </label>
        <div className="hire-quick" role="group" aria-label={t("hiring.count")}>
          {QUICK.map((n) => (
            <button key={n} type="button" className={`chip${count === n ? " on" : ""}`} aria-pressed={count === n} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <label>
        {t("hiring.recruiter")}
        <select value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)} name="recruiter">
          {bots.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {brainLabel(t, b.brain.kind)}
            </option>
          ))}
        </select>
        <span className="muted small">{t("hiring.recruiterHelp")}</span>
      </label>
      <p className="hire-estimate muted small">{t("hiring.estimate", { count, tokens: count * TOKENS_PER_RESUME, profile: TOKENS_PER_PROFILE })}</p>
      <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
        {t("hiring.generate", { count })}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function CandidateCard({
  c,
  tools,
  onHire,
  onDismiss,
  onRestore,
  onOpenBot,
}: {
  c: Candidate;
  tools: Map<string, HiringTool>;
  onHire(): void;
  onDismiss(): void;
  onRestore(): void;
  onOpenBot(id: string): void;
}) {
  const t = useT();
  return (
    <article className={`hire-card ${c.status}`} data-testid={`candidate-${c.id}`} aria-label={`${c.name}, ${c.role}`}>
      <div className="hire-card-top">
        <Avatar bot={face(c)} size={44} />
        <div className="hire-card-title">
          <strong>{c.name}</strong>
          <span className="muted small">{c.role}</span>
        </div>
        {c.status === "open" && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t("hiring.dismiss", { name: c.name })}
            title={t("hiring.dismiss", { name: c.name })}
            onClick={onDismiss}
          >
            ✕
          </button>
        )}
      </div>
      {c.headline && <p className="hire-headline">{c.headline}</p>}
      {c.strengths.length > 0 && (
        <ul className="hire-strengths" aria-label={t("hiring.strengths")}>
          {c.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {c.tools.length > 0 && (
        <div className="hire-tools" aria-label={t("hiring.tools")}>
          {c.tools.map((id) => (
            <ToolChip key={id} id={id} tools={tools} />
          ))}
        </div>
      )}
      {c.error && <p className="error small">{c.error}</p>}
      <div className="hire-actions">
        {c.status === "open" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onHire}>
            {t("hiring.hire")}
          </button>
        )}
        {c.status === "hiring" && (
          <span className="status-pill wait" role="status">
            {t("hiring.hiring")}
          </span>
        )}
        {c.status === "hired" && (
          <>
            <span className="status-pill ok">✓ {t("hiring.hired")}</span>
            {c.botId && (
              <button type="button" className="btn btn-sm" onClick={() => onOpenBot(c.botId!)}>
                {t("hiring.openChat")}
              </button>
            )}
          </>
        )}
        {c.status === "dismissed" && (
          <button type="button" className="btn btn-sm" onClick={onRestore}>
            {t("hiring.restore")}
          </button>
        )}
      </div>
    </article>
  );
}

function HireSheet({
  api,
  c,
  round,
  bots,
  group,
  onClose,
}: {
  api: Api;
  c: Candidate;
  round: HiringRound;
  bots: Bot[];
  group: Conversation | undefined;
  onClose(): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const recruiter = bots.find((b) => b.id === round.recruiterId);
  const [brainFrom, setBrainFrom] = useState(recruiter?.id ?? bots[0]?.id ?? "");
  const [reportsTo, setReportsTo] = useState(round.basis === "team" ? (group?.leadBotId ?? "") : "");
  const [join, setJoin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hire = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/hiring/candidates/${c.id}/hire`, {
        brainFrom,
        reportsTo: reportsTo || null,
        ...(group ? { joinGroup: join } : {}),
        lang,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <Sheet title={t("hiring.hireTitle", { name: c.name })} onClose={onClose} testId="hire-sheet">
      <div className="hire-hero">
        <Avatar bot={face(c)} size={56} />
        <div>
          <strong>{c.name}</strong>
          <p className="muted small">{c.role}</p>
        </div>
      </div>
      {c.headline && <p>{c.headline}</p>}
      <form
        className="prefs-form"
        onSubmit={(e) => {
          e.preventDefault();
          void hire();
        }}
      >
        <label>
          {t("hiring.brainFrom")}
          <select value={brainFrom} onChange={(e) => setBrainFrom(e.target.value)} name="brain-from">
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {brainLabel(t, b.brain.kind)}
              </option>
            ))}
          </select>
          <span className="muted small">{t("hiring.brainFromHelp")}</span>
        </label>
        <label>
          {t("hiring.reportsTo")}
          <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} name="reports-to">
            <option value="">{t("hiring.nobody")}</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {botLabel(b)}
              </option>
            ))}
          </select>
        </label>
        {group && (
          <label className="check">
            <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} name="join-group" />{" "}
            {t("hiring.joinGroup", { group: group.title })}
          </label>
        )}
        <p className="muted small">{t("hiring.profileHelp", { recruiter: recruiter?.name ?? "—", name: c.name, tokens: TOKENS_PER_PROFILE })}</p>
        <button className="btn btn-primary" type="submit" disabled={busy || !brainFrom}>
          {t("hiring.hireNow", { name: c.name })}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </Sheet>
  );
}

function RoundCard({
  api,
  round,
  bots,
  groups,
  tools,
  onHire,
  onOpenBot,
}: {
  api: Api;
  round: HiringRound;
  bots: Bot[];
  groups: Conversation[];
  tools: Map<string, HiringTool>;
  onHire(c: Candidate): void;
  onOpenBot(id: string): void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [showDismissed, setShowDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const group = groups.find((g) => g.id === round.groupId);
  const recruiter = bots.find((b) => b.id === round.recruiterId);
  const title = round.basis === "team" ? t("hiring.forTeam", { group: group?.title ?? "—" }) : round.brief;
  const visible = round.candidates.filter((c) => c.status !== "dismissed");
  const dismissed = round.candidates.filter((c) => c.status === "dismissed");
  const shown = showDismissed ? round.candidates : visible;
  const hired = round.candidates.filter((c) => c.status === "hired").length;
  const tokens = round.usage.inputTokens + round.usage.outputTokens;
  const more = Math.max(1, Math.min(30, round.requested || 10));
  const mark = (c: Candidate, status: "open" | "dismissed") => void act(() => api.request("PATCH", `/api/v1/hiring/candidates/${c.id}`, { status }));
  return (
    <section className="hire-round" data-testid={`round-${round.id}`} aria-label={title}>
      <header className="hire-round-head">
        <div className="hire-round-title">
          <span className="mcp-tag">{t(round.basis === "team" ? "hiring.basis.team" : "hiring.basis.project")}</span>
          <h2 title={title}>{title}</h2>
          <p className="muted small">
            {new Date(round.createdAt).toLocaleString(lang)} · {t("hiring.by", { name: recruiter?.name ?? "—" })} ·{" "}
            {t("hiring.summary", { count: round.candidates.length, hired })}
            {tokens > 0 && <> · {t("hiring.tokens", { tokens: tokens.toLocaleString(lang) })}</>}
          </p>
        </div>
        <div className="hire-round-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={round.status === "generating"}
            onClick={() => void act(() => api.post(`/api/v1/hiring/rounds/${round.id}/more`, { count: more, lang }))}
          >
            {t("hiring.more", { count: more })}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-label={t("hiring.deleteRound")}
            title={t("hiring.deleteRound")}
            disabled={round.status === "generating"}
            onClick={() => {
              if (window.confirm(t("hiring.confirmDelete"))) void act(() => api.delete(`/api/v1/hiring/rounds/${round.id}`));
            }}
          >
            🗑
          </button>
        </div>
      </header>
      {round.status === "generating" && (
        <p className="status-line wait" role="status">
          <i className="dot" aria-hidden="true" /> {t("hiring.generating", { count: round.requested, name: recruiter?.name ?? "—" })}
        </p>
      )}
      {round.status === "failed" && round.error && <p className="error">{round.error}</p>}
      {error && <p className="error">{error}</p>}
      {shown.length > 0 && (
        <div className="hire-grid">
          {shown.map((c) => (
            <CandidateCard
              key={c.id}
              c={c}
              tools={tools}
              onHire={() => onHire(c)}
              onDismiss={() => mark(c, "dismissed")}
              onRestore={() => mark(c, "open")}
              onOpenBot={onOpenBot}
            />
          ))}
        </div>
      )}
      {dismissed.length > 0 && (
        <button type="button" className="link" aria-expanded={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? t("hiring.hideDismissed") : t("hiring.showDismissed", { count: dismissed.length })}
        </button>
      )}
    </section>
  );
}

export function HiringScreen({
  api,
  bots,
  conversations,
  rounds,
  onLoad,
  onOpenBot,
}: {
  api: Api;
  bots: Bot[];
  conversations: Conversation[];
  rounds: Record<string, HiringRound> | null;
  onLoad(): Promise<void>;
  onOpenBot(id: string): void;
}) {
  const t = useT();
  const [tools, setTools] = useState<HiringTool[]>([]);
  const [hiring, setHiring] = useState<{ round: string; candidate: string } | null>(null);
  useEffect(() => {
    void onLoad().catch(() => undefined);
    api
      .get<HiringTool[]>("/api/v1/hiring/tools")
      .then(setTools)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);
  const visibleBots = bots.filter((b) => !b.hidden);
  const groups = conversations.filter((c) => c.kind === "group");
  const list = Object.values(rounds ?? {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = hiring ? rounds?.[hiring.round] : undefined;
  const candidate = open?.candidates.find((c) => c.id === hiring?.candidate);
  return (
    <section className="screen hiring-screen" aria-labelledby="hiring-title" data-testid="hiring">
      <header className="screen-head">
        <h1 id="hiring-title">{t("hiring.title")}</h1>
        <p className="muted">{t("hiring.help")}</p>
      </header>
      <div className="screen-body hire-body">
        <NewRound api={api} bots={visibleBots} groups={groups} />
        {rounds === null && <p className="muted">…</p>}
        {rounds !== null && list.length === 0 && <p className="muted hire-empty">{t("hiring.none")}</p>}
        {list.map((round) => (
          <RoundCard
            key={round.id}
            api={api}
            round={round}
            bots={visibleBots}
            groups={groups}
            tools={toolMap}
            onHire={(c) => setHiring({ round: round.id, candidate: c.id })}
            onOpenBot={onOpenBot}
          />
        ))}
      </div>
      {open && candidate && (
        <HireSheet api={api} c={candidate} round={open} bots={visibleBots} group={groups.find((g) => g.id === open.groupId)} onClose={() => setHiring(null)} />
      )}
    </section>
  );
}
