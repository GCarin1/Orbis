// What hiring asks the recruiter's brain, and how its answers are read (specs/hiring, ADR 0015). Short
// résumés first, one JSON object per line, so twenty fit in one small answer; the full profile of one
// candidate only when the user hires it.
import { SKILL_NAME, type HiringTool } from "@orbis/shared";

export type Lang = "en" | "pt-BR";

/** Orbis's own tools a candidate may take, by group; the team, memory, drafts and skills come with every bot. */
export const ORBIS_TOOLS: Array<HiringTool & { pattern: string }> = [
  { id: "computer", name: "Computer", description: "a shell and files in its own workspace", logo: null, pattern: "computer.*" },
  { id: "browser", name: "Browser", description: "a web browser it drives: open, click, type, read pages", logo: null, pattern: "browser.*" },
  { id: "web", name: "Web", description: "fetches web pages and APIs, read only", logo: null, pattern: "http.*" },
];

export interface CandidateDraft {
  name: string;
  role: string;
  headline: string;
  strengths: string[];
  tools: string[];
}

export interface PersonaSkill {
  name: string;
  description: string;
  steps: string[];
}

export interface Persona {
  description: string;
  responsibilities: string[];
  needs: string[];
  tools: string[];
  skills: PersonaSkill[];
  intro: string;
}

/** What the work is, as the recruiter reads it. */
export interface WorkContext {
  basis: "project" | "team";
  /** The project's scope, or the focus asked for a team. */
  brief: string;
  team?: {
    title: string;
    description: string;
    members: Array<{ name: string; role: string }>;
    /** The group's latest messages, oldest first: "Name: text". */
    recent: string[];
  };
}

const LANGUAGE: Record<Lang, string> = { en: "English", "pt-BR": "Brazilian Portuguese" };

const clip = (text: string, n: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

export function describeWork(work: WorkContext): string {
  const lines: string[] = [];
  if (work.basis === "project") {
    lines.push(`The project, as the user describes it: ${clip(work.brief, 4000)}`);
  } else if (work.team) {
    lines.push(`The team (an Orbis group) "${clip(work.team.title, 120)}".`);
    if (work.team.description.trim()) lines.push(`What it is for: ${clip(work.team.description, 1000)}`);
    lines.push(`Its members: ${work.team.members.map((m) => (m.role ? `${m.name} (${m.role})` : m.name)).join(", ") || "none"}.`);
    if (work.team.recent.length) lines.push("What they are working on, from the group's latest messages:", ...work.team.recent.map((r) => `- ${clip(r, 240)}`));
    if (work.brief.trim()) lines.push(`What the user wants more of in this team: ${clip(work.brief, 1500)}`);
  }
  return lines.join("\n");
}

export function describeTools(tools: HiringTool[]): string {
  return tools.map((t) => `- ${t.id}: ${t.name} — ${clip(t.description, 160)}`).join("\n");
}

export const RECRUITER_IDENTITY =
  "You are the recruiter of an Orbis workspace: you propose AI teammates (bots) for the user to hire. You answer only in the exact format asked, with no other text.";

/** The task that asks for `count` short résumés. */
export function candidatesTask(work: WorkContext, tools: HiringTool[], count: number, avoid: string[], lang: Lang): string {
  return [
    `Propose ${count} candidates — AI teammates — who would help with the work below. Make them varied: different roles, seniority and approaches, each one filling a different gap.`,
    "",
    "THE WORK",
    describeWork(work),
    "",
    "TOOLS AVAILABLE (a candidate may list only these ids)",
    describeTools(tools),
    "Every candidate also talks with the team, remembers, drafts messages and reads skills: do not list those.",
    ...(avoid.length ? ["", `ALREADY IN THE TEAM OR ALREADY PROPOSED — do not repeat these names or roles: ${avoid.map((a) => clip(a, 80)).join("; ")}`] : []),
    "",
    `Answer with exactly ${count} lines and nothing else, one JSON object per line:`,
    '{"name":"<a first name>","role":"<job title, 2 to 4 words>","headline":"<who they are and what they bring, one sentence of at most 20 words>","strengths":["<at most 5 words>","…","…"],"tools":["<ids from the list>"]}',
    `Write name, role, headline and strengths in ${LANGUAGE[lang]}.`,
  ].join("\n");
}

/** Every JSON object in a brain's answer: one per line, a JSON array, or inside a code fence. */
function jsonObjects(text: string): unknown[] {
  const clean = text.replace(/```[a-z]*\n?/gi, "").trim();
  const array = clean.indexOf("[");
  if (array >= 0 && array < clean.indexOf("{")) {
    try {
      const parsed = JSON.parse(clean.slice(array, clean.lastIndexOf("]") + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not one array: read it line by line */
    }
  }
  const found: unknown[] = [];
  for (const line of clean.split("\n")) {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      found.push(JSON.parse(line.slice(start, end + 1)));
    } catch {
      /* a line that is not an object */
    }
  }
  return found;
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? clip(value, max) : "");
const texts = (value: unknown, max: number, each: number): string[] =>
  Array.isArray(value)
    ? value
        .map((v) => text(v, each))
        .filter(Boolean)
        .slice(0, max)
    : [];
const toolIds = (value: unknown, known: Set<string>): string[] => [...new Set(texts(value, 20, 80).filter((id) => known.has(id)))];

/** The résumés in a recruiter's answer: valid ones only, no repeated name, tools among `known`, at most `max`. */
export function parseCandidates(reply: string, known: Set<string>, max: number, taken: string[] = []): CandidateDraft[] {
  const seen = new Set(taken.map((n) => n.toLowerCase()));
  const out: CandidateDraft[] = [];
  for (const raw of jsonObjects(reply)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = text(o.name, 40);
    const role = text(o.role, 60);
    if (!name || !role || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, role, headline: text(o.headline, 200), strengths: texts(o.strengths, 5, 60), tools: toolIds(o.tools, known) });
    if (out.length >= max) break;
  }
  return out;
}

/** The task that asks for one candidate's full profile. */
export function personaTask(c: CandidateDraft, work: WorkContext, tools: HiringTool[], lang: Lang): string {
  return [
    `The user is hiring ${c.name}, ${c.role}: ${c.headline}`,
    `Strengths: ${c.strengths.join("; ") || "—"}. Tools proposed: ${c.tools.join(", ") || "none"}.`,
    "",
    "THE WORK",
    describeWork(work),
    "",
    "TOOLS AVAILABLE (list only these ids)",
    describeTools(tools),
    "",
    "Write this teammate's full profile as one JSON object and nothing else:",
    "{",
    '"description":"<their standing instructions, in the second person: who they are, how they work, what they own, when they ask before acting, how they report back; 80 to 160 words>",',
    '"responsibilities":["<what they will do, 3 to 5 items>"],',
    '"needs":["<what they need from the user to start: access, files, decisions; 0 to 4 items>"],',
    '"tools":["<ids from the list>"],',
    '"skills":[{"name":"<kebab-case, at most 40 characters>","description":"<what the skill does and when to use it, one sentence>","steps":["<one step>","…"]}],',
    '"intro":"<their first message to the user, in the first person, 2 to 4 sentences: hello, what they will do first, what they need>"',
    "}",
    "Give 1 to 3 skills of 3 to 7 steps each: procedures this teammate repeats in this work.",
    `Write every text in ${LANGUAGE[lang]}.`,
  ].join("\n");
}

/** A skill name Orbis accepts: lower-case words joined by `-`. */
export function skillName(raw: string): string {
  const name = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return SKILL_NAME.test(name) ? name : "";
}

/** The profile in a brain's answer, or null when it holds none. */
export function parsePersona(reply: string, known: Set<string>): Persona | null {
  const clean = reply.replace(/```[a-z]*\n?/gi, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const description = typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "";
  if (!description) return null;
  const skills: PersonaSkill[] = [];
  for (const raw of Array.isArray(o.skills) ? o.skills.slice(0, 3) : []) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const name = skillName(text(s.name, 80));
    const steps = texts(s.steps, 10, 400);
    if (!name || !text(s.description, 400) || !steps.length || skills.some((k) => k.name === name)) continue;
    skills.push({ name, description: text(s.description, 400), steps });
  }
  return {
    description,
    responsibilities: texts(o.responsibilities, 6, 200),
    needs: texts(o.needs, 5, 200),
    tools: toolIds(o.tools, known),
    skills,
    intro: typeof o.intro === "string" ? o.intro.trim().slice(0, 1200) : "",
  };
}

/** A skill as the SKILL.md document Orbis stores. */
export function skillDocument(skill: PersonaSkill, title: string): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${title}`,
    "",
    ...skill.steps.map((step, i) => `${i + 1}. ${step}`),
    "",
  ].join("\n");
}

/**
 * A hired bot's tool allowlist: every Orbis tool but the computer, browser and web groups it does not take,
 * and the MCP servers it does (an external server is offered only when a pattern names it).
 */
export function allowlistFor(tools: string[]): string[] {
  const take = new Set(tools);
  return [
    "*",
    ...ORBIS_TOOLS.filter((t) => !take.has(t.id)).map((t) => `!${t.pattern}`),
    ...tools.filter((id) => id.startsWith("mcp.")).map((id) => `${id}.*`),
  ];
}
