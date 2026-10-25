// Squads (specs/squads): bots organized under a name, each with a representative the members report to and a
// manager the representative reports to (one manager may take every squad). The org chart on top, a card per
// squad, the bots in no squad, each squad's chat and the room where the representatives and managers talk.
// The chart is the centre (a squad in it jumps to its card); rare actions sit in the ⋮ menu (change 0097).
import { useEffect, useRef, useState } from "react";
import type { Bot, Squad, SquadsView } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";
import { Avatar, botLabel } from "./Avatar.js";
import { ChatIcon, MoreIcon, PlusIcon } from "./Icons.js";

type T = ReturnType<typeof useT>;

function useAct() {
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  return { error, act };
}

/** Managers on top, the squads each one takes under it, and the squads with no manager. */
function OrgChart({ squads, bots, t }: { squads: Squad[]; bots: Map<string, Bot>; t: T }) {
  const managers = [...new Set(squads.map((s) => s.managerId))];
  return (
    <section className="org-chart" aria-label={t("squads.chart")}>
      {managers.map((managerId) => {
        const manager = managerId ? bots.get(managerId) : undefined;
        const under = squads.filter((s) => s.managerId === managerId);
        return (
          <div key={managerId ?? "none"} className="org-branch">
            <div className="org-manager">
              {manager ? <Avatar bot={manager} size={32} /> : <span className="org-none" aria-hidden="true" />}
              <span>
                <strong>{manager?.name ?? t("squads.noManager")}</strong>
                {manager && <span className="muted small"> · {t("squads.manager")}</span>}
              </span>
            </div>
            <ul className="org-squads">
              {under.map((s) => {
                const rep = s.representativeId ? bots.get(s.representativeId) : undefined;
                return (
                  <li key={s.id} style={{ ["--squad" as string]: s.color }}>
                    <button
                      type="button"
                      className="org-squad"
                      onClick={() => {
                        const card = document.getElementById(`squad-card-${s.id}`);
                        card?.scrollIntoView({ behavior: "smooth", block: "start" });
                        card?.focus({ preventScroll: true });
                      }}
                    >
                      <span className="squad-dot" aria-hidden="true" />
                      <strong>{s.name}</strong>
                      <span className="muted small">
                        {rep ? `★ ${rep.name}` : t("squads.noRep")} · {t(s.members.length === 1 ? "squads.botsOne" : "squads.botsCount", { count: s.members.length })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function SquadCard({
  api,
  squad,
  squads,
  bots,
  onOpenGroup,
}: {
  api: Api;
  squad: Squad;
  squads: Squad[];
  bots: Map<string, Bot>;
  onOpenGroup(id: string): void;
}) {
  const t = useT();
  const { error, act } = useAct();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(squad.name);
  const [description, setDescription] = useState(squad.description);
  const [color, setColor] = useState(squad.color);
  const [changingManager, setChangingManager] = useState(false);
  const patch = (body: object) => act(() => api.request("PATCH", `/api/v1/squads/${squad.id}`, body));
  const members = squad.members.map((id) => bots.get(id)).filter((b): b is Bot => b !== undefined);
  const manager = squad.managerId ? bots.get(squad.managerId) : undefined;
  const outside = [...bots.values()].filter((b) => !squad.members.includes(b.id));
  const squadOf = (b: Bot) => squads.find((s) => s.id === b.squadId);
  return (
    <article
      className="squad-card"
      id={`squad-card-${squad.id}`}
      tabIndex={-1}
      style={{ ["--squad" as string]: squad.color }}
      data-testid={`squad-${squad.handle}`}
      aria-label={squad.name}
    >
      <header className="squad-head">
        {editing ? (
          <form
            className="prefs-form squad-edit"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await patch({ name: title, description, color })) setEditing(false);
            }}
          >
            <label>
              {t("squads.name")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} name="squad-name" />
            </label>
            <label>
              {t("squads.description")}
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} name="squad-description" />
            </label>
            <label className="squad-color">
              {t("squads.color")}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} name="squad-color" />
            </label>
            <div className="card-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!title.trim()}>
                {t("squads.save")}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                {t("newbot.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="squad-title">
              <h2>{squad.name}</h2>
              <span className="muted small">@{squad.handle}</span>
              {squad.description && <p className="muted small">{squad.description}</p>}
            </div>
            <div className="squad-actions">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                {t("squads.edit")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-label={t("squads.delete", { name: squad.name })}
                title={t("squads.delete", { name: squad.name })}
                onClick={() => {
                  if (window.confirm(t("squads.confirmDelete", { name: squad.name }))) void act(() => api.delete(`/api/v1/squads/${squad.id}`));
                }}
              >
                🗑
              </button>
            </div>
          </>
        )}
      </header>
      {changingManager ? (
        <label className="squad-field">
          {t("squads.manager")}
          <select
            value={squad.managerId ?? ""}
            onChange={(e) => {
              setChangingManager(false);
              void patch({ managerId: e.target.value || null });
            }}
            onBlur={() => setChangingManager(false)}
            name="squad-manager"
            autoFocus
          >
            <option value="">{t("squads.noManager")}</option>
            {outside.map((b) => (
              <option key={b.id} value={b.id}>
                {botLabel(b)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="squad-manager-line">
          <span className="muted">{t("squads.manager")}:</span>{" "}
          {manager ? (
            <span className="usage-bot">
              <Avatar bot={manager} size={22} />
              <strong>{manager.name}</strong>
            </span>
          ) : (
            <span className="muted">{t("squads.noManager")}</span>
          )}{" "}
          <button type="button" className="link" onClick={() => setChangingManager(true)} aria-label={t("squads.changeManager", { name: squad.name })}>
            {t("squads.change")}
          </button>
        </p>
      )}
      <ul className="squad-members" aria-label={t("squads.members")}>
        {members.map((b) => {
          const rep = b.id === squad.representativeId;
          return (
            <li key={b.id} className={rep ? "rep" : ""}>
              <Avatar bot={b} size={30} />
              <span className="squad-member-text">
                <strong>{b.name}</strong>
                <span className="muted small">{rep ? t("squads.representative") : b.role || t("squads.member")}</span>
              </span>
              {!rep && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("squads.makeRep", { name: b.name })}
                  title={t("squads.makeRep", { name: b.name })}
                  onClick={() => void patch({ representativeId: b.id })}
                >
                  ☆
                </button>
              )}
              {rep && (
                <span className="squad-star" aria-hidden="true">
                  ★
                </span>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={t("squads.remove", { name: b.name })}
                title={t("squads.remove", { name: b.name })}
                onClick={() => void act(() => api.delete(`/api/v1/squads/${squad.id}/members/${b.id}`))}
              >
                ✕
              </button>
            </li>
          );
        })}
        {members.length === 0 && <li className="muted small">{t("squads.empty")}</li>}
      </ul>
      <select
        className="squad-add"
        aria-label={t("squads.add")}
        value=""
        onChange={(e) => e.target.value && void act(() => api.request("PUT", `/api/v1/squads/${squad.id}/members/${e.target.value}`))}
        name="squad-add"
      >
        <option value="">+ {t("squads.add")}</option>
        {outside
          .filter((b) => b.id !== squad.managerId)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {squadOf(b) ? ` (${t("squads.inSquad", { squad: squadOf(b)!.name })})` : ""}
            </option>
          ))}
      </select>
      {squad.conversationId ? (
        <button type="button" className="btn btn-sm squad-chat" onClick={() => onOpenGroup(squad.conversationId!)}>
          <ChatIcon size={16} /> {t("squads.openChat")}
        </button>
      ) : (
        <p className="muted small">{t("squads.chatFromTwo")}</p>
      )}
      {error && <p className="error small">{error}</p>}
    </article>
  );
}

function NewSquad({ api, bots, squads, onDone }: { api: Api; bots: Bot[]; squads: Squad[]; onDone(): void }) {
  const t = useT();
  const { error, act } = useAct();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const squadOf = (b: Bot) => squads.find((s) => s.id === b.squadId);
  return (
    <form
      className="prefs-form squad-new"
      data-testid="squad-new"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await act(() => api.post("/api/v1/squads", { name: title, description, members }))) onDone();
      }}
    >
      <h2>{t("squads.new")}</h2>
      <label>
        {t("squads.name")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t("squads.namePlaceholder")} name="new-squad-name" />
      </label>
      <label>
        {t("squads.description")}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} name="new-squad-description" />
      </label>
      <fieldset className="squad-pick">
        <legend>
          {t("squads.members")}
          {members.length > 0 && <span className="muted small"> · {members.length}</span>}
        </legend>
        {bots.map((b) => {
          const other = squadOf(b);
          const about = [b.role, other && t("squads.inSquad", { squad: other.name })].filter(Boolean).join(" · ");
          return (
            <label key={b.id} className={`pick-row${members.includes(b.id) ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={members.includes(b.id)}
                onChange={(e) => setMembers((all) => (e.target.checked ? [...all, b.id] : all.filter((id) => id !== b.id)))}
              />
              <Avatar bot={b} size={30} />
              <span className="pick-text">
                <strong>{b.name}</strong>
                {about && <span className="muted small">{about}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="muted small">{t("squads.newHelp")}</p>
      <div className="card-actions">
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
          {t("squads.create")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("newbot.cancel")}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** The screen's ⋮ menu: what is done once in a while — one manager for every squad. */
function SquadsMenu({ api, bots, onError }: { api: Api; bots: Bot[]; onError(fn: () => Promise<unknown>): Promise<boolean> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [managerOfAll, setManagerOfAll] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="new-menu squads-menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={t("squads.menu")} title={t("squads.menu")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="menu squads-menu-body" role="group" aria-label={t("squads.menu")}>
          <form
            className="squads-manager"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onError(() => api.post("/api/v1/squads/manager", { managerId: managerOfAll || null }))) setOpen(false);
            }}
          >
            <label>
              {t("squads.managerOfAll")}
              <select value={managerOfAll} onChange={(e) => setManagerOfAll(e.target.value)} name="manager-of-all">
                <option value="">{t("squads.noManager")}</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {botLabel(b)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-sm">
              {t("squads.applyAll")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function SquadsScreen({ api, bots, view, onOpenGroup }: { api: Api; bots: Bot[]; view: SquadsView | null; onOpenGroup(id: string): void }) {
  const t = useT();
  const { error, act } = useAct();
  const [creating, setCreating] = useState(false);
  const visible = bots.filter((b) => !b.hidden);
  const byId = new Map(visible.map((b) => [b.id, b]));
  const squads = view?.squads ?? [];
  const loose = visible.filter((b) => !b.squadId);
  return (
    <section className="screen squads-screen" aria-labelledby="squads-title" data-testid="squads">
      <header className="screen-head mcp-head">
        <div className="mcp-head-row">
          <div>
            <h1 id="squads-title">{t("squads.title")}</h1>
            <p className="muted">{t("squads.help")}</p>
          </div>
          <div className="squads-head-actions">
            <button type="button" className="btn btn-primary mcp-add" aria-label={t("squads.new")} title={t("squads.new")} onClick={() => setCreating(true)}>
              <PlusIcon size={16} /> <span>{t("squads.new")}</span>
            </button>
            {squads.length > 0 && <SquadsMenu api={api} bots={visible} onError={act} />}
          </div>
        </div>
      </header>
      <div className="screen-body squads-body">
        {creating && <NewSquad api={api} bots={visible} squads={squads} onDone={() => setCreating(false)} />}
        {view === null && <p className="muted">…</p>}
        {view !== null && squads.length === 0 && !creating && (
          <div className="mcp-empty big">
            <h2>{t("squads.emptyTitle")}</h2>
            <p className="muted">{t("squads.emptyHelp")}</p>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              {t("squads.new")}
            </button>
          </div>
        )}
        {squads.length > 0 && (
          <>
            <OrgChart squads={squads} bots={byId} t={t} />
            <div className="squads-bar">
              {view?.roomId && (
                <button type="button" className="btn btn-sm" onClick={() => onOpenGroup(view.roomId!)}>
                  <ChatIcon size={16} /> {t("squads.openRoom")}
                </button>
              )}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="squads-grid">
              {squads.map((squad) => (
                <SquadCard key={squad.id} api={api} squad={squad} squads={squads} bots={byId} onOpenGroup={onOpenGroup} />
              ))}
            </div>
            {loose.length > 0 && (
              <section className="squads-loose" aria-labelledby="squads-loose">
                <h2 id="squads-loose">{t("squads.loose", { count: loose.length })}</h2>
                <ul>
                  {loose.map((b) => (
                    <li key={b.id}>
                      <Avatar bot={b} size={28} />
                      <span className="squad-member-text">
                        <strong>{b.name}</strong>
                        <span className="muted small">{b.role}</span>
                      </span>
                      <select
                        aria-label={t("squads.addTo", { name: b.name })}
                        value=""
                        onChange={(e) => e.target.value && void act(() => api.request("PUT", `/api/v1/squads/${e.target.value}/members/${b.id}`))}
                      >
                        <option value="">{t("squads.addTo", { name: b.name })}</option>
                        {squads
                          .filter((s) => s.managerId !== b.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
