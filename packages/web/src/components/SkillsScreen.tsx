// Skills screen: the procedures of the account or of one bot (specs/skills, specs/web-app). A skill is written
// in a form — name, what it does, when to use it, its steps — and the SKILL.md text is a toggle away for what
// the form cannot hold (change 0095).
import { useEffect, useState } from "react";
import type { Bot, Skill, SkillInfo } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { PlusIcon } from "./Icons.js";

export interface SkillForm {
  name: string;
  description: string;
  when: string;
  steps: string[];
}

const TEMPLATES: Record<string, SkillForm> = {
  "pt-BR": {
    name: "resumo-semanal",
    description: "Resumir a semana do time numa mensagem curta",
    when: "Toda sexta, ou quando eu pedir o resumo da semana",
    steps: ["Liste o que cada bot concluiu nesta semana.", "Junte por assunto, uma linha cada, em linguagem simples.", "Termine com o que ficou pendente e quem cuida."],
  },
  en: {
    name: "weekly-summary",
    description: "Sum up the team's week in one short message",
    when: "Every Friday, or when I ask for the week's summary",
    steps: ["List what each bot finished this week.", "Group it by subject, one line each, in plain language.", "End with what is still open and who has it."],
  },
};

/** A value as YAML: bare when that reads back the same, else a JSON string (JSON is YAML). */
const yamlValue = (v: string) => (/^[\p{L}\p{N}][^:#\n"']*$/u.test(v) && v.trim() === v ? v : JSON.stringify(v));

export function toSkillMd(form: SkillForm): string {
  const steps = form.steps.map((s) => s.trim()).filter(Boolean);
  return [
    "---",
    `name: ${form.name.trim()}`,
    `description: ${yamlValue(form.description.trim())}`,
    ...(form.when.trim() ? [`when: ${yamlValue(form.when.trim())}`] : []),
    "---",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
  ].join("\n");
}

/** The form a SKILL.md fills, or null when it holds more than the form shows (other keys, headings, prose). */
export function fromSkillMd(text: string): SkillForm | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    if (!line.trim()) continue;
    const kv = /^(name|description|when):\s*(.*)$/.exec(line);
    if (!kv) return null;
    let value = kv[2]!.trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        return null;
      }
    } else if (value.startsWith("'")) return null;
    fields[kv[1]!] = value;
  }
  const lines = m[2]!.split("\n").filter((l) => l.trim());
  if (!lines.every((l) => /^\d+\.\s+\S/.test(l))) return null;
  return { name: fields.name ?? "", description: fields.description ?? "", when: fields.when ?? "", steps: lines.map((l) => l.replace(/^\d+\.\s+/, "")) };
}

export function SkillsScreen({ api, bots }: { api: Api; bots: Bot[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const template = () => TEMPLATES[lang] ?? TEMPLATES.en!;
  const [scope, setScope] = useState<string>(""); // "" = account, else a bot id
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // skill name, or null for a new one
  // The form is the skill while it shows; the text takes over when the user asks or the form cannot hold it.
  const [form, setFormState] = useState<SkillForm>(template);
  const [content, setContent] = useState("");
  const [text, setText] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const query = scope ? `?botId=${encodeURIComponent(scope)}` : "";
  const setForm = (next: Partial<SkillForm>) => setFormState({ ...form, ...next });

  const fresh = () => {
    setEditing(null);
    setFormState(template());
    setText(false);
    setMessage(null);
  };
  const toggle = () => {
    if (!text) {
      setContent(toSkillMd(form));
      setText(true);
      return;
    }
    const parsed = fromSkillMd(content);
    if (parsed) {
      setFormState(parsed);
      setText(false);
      setMessage(null);
    } else setMessage({ ok: false, text: t("skills.textOnly") });
  };
  const load = async () => setSkills(await api.get<SkillInfo[]>(`/api/v1/skills${query}`));
  useEffect(() => {
    fresh();
    void load().catch(() => setSkills([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const open = async (name: string) => {
    const skill = await api.get<Skill>(`/api/v1/skills/${encodeURIComponent(name)}${query}`);
    setEditing(name);
    setContent(skill.content);
    // A skill the form cannot hold opens as text.
    const parsed = fromSkillMd(skill.content);
    if (parsed) setFormState(parsed);
    setText(parsed === null);
    setMessage(null);
  };

  const save = async () => {
    const body = text ? content : toSkillMd(form);
    try {
      const skill = editing
        ? await api.request<Skill>("PUT", `/api/v1/skills/${encodeURIComponent(editing)}${query}`, { content: body })
        : await api.post<Skill>("/api/v1/skills", { content: body, ...(scope ? { botId: scope } : {}) });
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
    fresh();
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
        <div className="skills-list">
          <button type="button" className="btn btn-primary skills-new" aria-pressed={editing === null} onClick={fresh}>
            <PlusIcon size={16} /> {t("skills.new")}
          </button>
          <ul className="item-list" aria-label={t("skills.title")}>
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
        </div>
        <div className="editor">
          <h2 className="skills-editing">{editing ? `/${editing}` : t("skills.new")}</h2>
          {text ? (
            <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} aria-label="SKILL.md" rows={18} />
          ) : (
            <div className="routine-form skill-form" data-testid="skill-form">
              <label>
                {t("skills.name")}
                <input
                  value={form.name}
                  onChange={(e) => setForm({ name: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })}
                  maxLength={64}
                  name="skill-name"
                  aria-describedby="skill-name-help"
                />
              </label>
              <span id="skill-name-help" className="muted small field-help">
                {t("skills.nameHelp", { name: form.name })}
              </span>
              <label>
                {t("skills.description")}
                <input value={form.description} onChange={(e) => setForm({ description: e.target.value })} maxLength={1024} name="skill-description" />
              </label>
              <label>
                {t("skills.when")}
                <input value={form.when} onChange={(e) => setForm({ when: e.target.value })} maxLength={500} name="skill-when" />
              </label>
              <fieldset className="skill-steps">
                <legend>{t("skills.steps")}</legend>
                <ol>
                  {form.steps.map((step, i) => (
                    <li key={i}>
                      <span className="skill-step-n" aria-hidden="true">
                        {i + 1}.
                      </span>
                      <input
                        value={step}
                        aria-label={t("skills.step", { n: i + 1 })}
                        onChange={(e) => setForm({ steps: form.steps.map((s, j) => (j === i ? e.target.value : s)) })}
                      />
                      <button type="button" className="icon-btn" aria-label={t("skills.removeStep", { n: i + 1 })} onClick={() => setForm({ steps: form.steps.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="btn btn-sm" onClick={() => setForm({ steps: [...form.steps, ""] })}>
                  <span aria-hidden="true">+</span> {t("skills.addStep")}
                </button>
              </fieldset>
            </div>
          )}
          <button type="button" className="link skills-as-text" aria-pressed={text} onClick={toggle}>
            {text ? t("skills.asForm") : t("skills.asText")}
          </button>
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
