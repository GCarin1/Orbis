// Skills as SKILL.md files on disk (specs/skills): `<data>/skills/<name>/SKILL.md`
// at account scope, `<data>/bots/<id>/skills/<name>/SKILL.md` at one bot's.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { SKILL_NAME, type Bot, type Skill, type SkillInfo } from "@orbis/shared";
import { globToRegExp } from "../tools/registry.js";

export class SkillError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super(`invalid skill: ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  }
}

export interface ParsedSkill {
  name: string;
  description: string;
  when: string | null;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Parse and validate a SKILL.md document. */
export function parseSkill(content: string): ParsedSkill {
  const m = FRONTMATTER.exec(content.replace(/^﻿/, ""));
  if (!m) throw new SkillError({ content: "must start with YAML frontmatter between --- lines (name, description)" });
  let meta: unknown;
  try {
    meta = parseYaml(m[1]!);
  } catch (err) {
    throw new SkillError({ frontmatter: `is not valid YAML (${err instanceof Error ? err.message.split("\n")[0] : String(err)})` });
  }
  const data = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!SKILL_NAME.test(name)) fields.name = "must be 1 to 64 characters of a-z, 0-9 and -";
  if (!description) fields.description = "is required";
  else if (description.length > 1024) fields.description = "must be at most 1024 characters";
  if (Object.keys(fields).length) throw new SkillError(fields);
  return { name, description, when: typeof data.when === "string" && data.when.trim() ? data.when.trim() : null, body: m[2]!.trim() };
}

export class SkillStore {
  constructor(private readonly dataDir: string) {}

  private root(botId: string | null): string {
    return botId ? path.join(this.dataDir, "bots", botId, "skills") : path.join(this.dataDir, "skills");
  }

  private file(botId: string | null, name: string): string {
    return path.join(this.root(botId), name, "SKILL.md");
  }

  private read(botId: string | null, name: string): Skill | null {
    const file = this.file(botId, name);
    if (!existsSync(file)) return null;
    const content = readFileSync(file, "utf8");
    try {
      const parsed = parseSkill(content);
      if (parsed.name !== name) return null; // a folder whose SKILL.md names another skill is ignored
      return {
        name,
        description: parsed.description,
        when: parsed.when,
        scope: botId ? "bot" : "account",
        botId,
        updatedAt: statSync(file).mtime.toISOString(),
        content,
        body: parsed.body,
      };
    } catch {
      return null; // an invalid file edited by hand is skipped until fixed
    }
  }

  /** Parse and validate a SKILL.md document without saving it. */
  parse(content: string): ParsedSkill {
    return parseSkill(content);
  }

  /** Skills of one scope (account when botId is null), by name. */
  list(botId: string | null): Skill[] {
    const root = this.root(botId);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SKILL_NAME.test(d.name))
      .map((d) => this.read(botId, d.name))
      .filter((s): s is Skill => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(botId: string | null, name: string): Skill | null {
    return SKILL_NAME.test(name) ? this.read(botId, name) : null;
  }

  /** Write a validated document; `expectName` pins the name on an update. */
  save(botId: string | null, content: string, opts: { create: boolean; expectName?: string }): Skill {
    const parsed = parseSkill(content);
    if (opts.expectName && parsed.name !== opts.expectName) {
      throw new SkillError({ name: `must stay "${opts.expectName}"; create a new skill to rename it` });
    }
    const exists = existsSync(this.file(botId, parsed.name));
    if (opts.create && exists) throw new SkillExistsError(parsed.name);
    if (!opts.create && !exists) throw new SkillMissingError(parsed.name);
    mkdirSync(path.dirname(this.file(botId, parsed.name)), { recursive: true });
    writeFileSync(this.file(botId, parsed.name), content.endsWith("\n") ? content : `${content}\n`);
    return this.read(botId, parsed.name)!;
  }

  delete(botId: string | null, name: string): boolean {
    if (!this.get(botId, name)) return false;
    rmSync(path.dirname(this.file(botId, name)), { recursive: true, force: true });
    return true;
  }

  /** Whether any scope holds a skill of this name (so `/name` is a skill invocation at all). */
  existsAnywhere(name: string): boolean {
    if (!SKILL_NAME.test(name)) return false;
    if (existsSync(this.file(null, name))) return true;
    const bots = path.join(this.dataDir, "bots");
    if (!existsSync(bots)) return false;
    return readdirSync(bots).some((botId) => existsSync(this.file(botId, name)));
  }

  /** The skills a bot is offered: account skills its allowlist matches, plus its own (own wins a clash). */
  offered(bot: Bot): Skill[] {
    const allow = bot.skills.map(globToRegExp);
    const own = this.list(bot.id);
    const names = new Set(own.map((s) => s.name));
    const account = this.list(null).filter((s) => !names.has(s.name) && allow.some((re) => re.test(s.name)));
    return [...own, ...account].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export class SkillExistsError extends Error {
  constructor(name: string) {
    super(`a skill named "${name}" already exists in this scope`);
  }
}

export class SkillMissingError extends Error {
  constructor(name: string) {
    super(`skill "${name}" not found`);
  }
}

export const info = ({ content: _c, body: _b, ...rest }: Skill): SkillInfo => rest;
