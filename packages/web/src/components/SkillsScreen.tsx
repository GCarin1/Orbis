// Skills screen: SKILL.md procedures of the account or of one bot (specs/skills, specs/web-app).
import { useEffect, useState } from "react";
import type { Bot, Skill, SkillInfo } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";

const TEMPLATE = `---
name: release-notes
description: Write the release notes of a version from its merged pull requests
---
1. List the pull requests merged since the last tag.
2. Group them by area; one line each, in plain language.
3. Post the notes as a draft for me to review.
`;

export function SkillsScreen({ api, bots }: { api: Api; bots: Bot[] }) {
  const t = useT();
  const [scope, setScope] = useState<string>(""); // "" = account, else a bot id
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // skill name, or null for a new one
  const [content, setContent] = useState(TEMPLATE);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const query = scope ? `?botId=${encodeURIComponent(scope)}` : "";

  const load = async () => setSkills(await api.get<SkillInfo[]>(`/api/v1/skills${query}`));
  useEffect(() => {
    setEditing(null);
    setContent(TEMPLATE);
    setMessage(null);
    void load().catch(() => setSkills([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const open = async (name: string) => {
    const skill = await api.get<Skill>(`/api/v1/skills/${encodeURIComponent(name)}${query}`);
    setEditing(name);
    setContent(skill.content);
    setMessage(null);
  };

  const save = async () => {
    try {
      const skill = editing
        ? await api.request<Skill>("PUT", `/api/v1/skills/${encodeURIComponent(editing)}${query}`, { content })
        : await api.post<Skill>("/api/v1/skills", { content, ...(scope ? { botId: scope } : {}) });
      setEditing(skill.name);
      setMessage({ ok: true, text: t("skills.saved") });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };

  const remove = async () => {
    if (!editing) return;
    await api.delete(`/api/v1/skills/${encodeURIComponent(editing)}${query}`);
    setEditing(null);
    setContent(TEMPLATE);
    await load();
  };

  return (
    <section className="screen" aria-labelledby="skills-title" data-testid="skills-screen">
      <header className="screen-head">
        <h1 id="skills-title">{t("skills.title")}</h1>
        <p className="muted">{t("skills.help")}</p>
        <label className="inline-field">
          {t("skills.scope")}
          <select value={scope} onChange={(e) => setScope(e.target.value)} name="scope">
            <option value="">{t("skills.account")}</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {t("skills.botScope", { name: b.name })}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="screen-body two-columns">
        <ul className="item-list" aria-label={t("skills.title")}>
          <li>
            <button
              className={`item-row${editing === null ? " selected" : ""}`}
              onClick={() => {
                setEditing(null);
                setContent(TEMPLATE);
                setMessage(null);
              }}
            >
              + {t("skills.new")}
            </button>
          </li>
          {skills.length === 0 && <li className="muted">{t("skills.empty")}</li>}
          {skills.map((s) => (
            <li key={s.name}>
              <button className={`item-row${editing === s.name ? " selected" : ""}`} onClick={() => void open(s.name)}>
                <strong>/{s.name}</strong>
                <span className="muted">{s.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="editor">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} aria-label="SKILL.md" rows={18} />
          {message && <p className={message.ok ? "muted" : "error"}>{message.text}</p>}
          <div className="card-actions">
            <button className="btn btn-primary" onClick={() => void save()}>
              {t("skills.save")}
            </button>
            {editing && (
              <button className="btn btn-danger" onClick={() => void remove()}>
                {t("skills.delete")}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
