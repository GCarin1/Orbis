// `orbis skills list|add|show|remove` — SKILL.md procedures for the account or one bot (specs/skills).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Skill, SkillInfo } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

const botQuery = (bot: string | undefined) => (bot ? `botId=${encodeURIComponent(bot.replace(/^@/, ""))}` : "");

async function readContent(ctx: CommandContext, file: string): Promise<string> {
  if (file !== "-") return readFileSync(file, "utf8");
  let text = "";
  for await (const chunk of ctx.io.stdin) text += chunk;
  return text;
}

export async function skillsCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  const c = paint(ctx.io);
  switch (sub) {
    case undefined:
    case "list":
    case "ls": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { offered: { type: "boolean" } }, strict: true });
      const bot = positionals[0];
      if (values.offered && !bot) throw new UsageError("--offered needs a bot: orbis skills list @ana --offered");
      const query = [botQuery(bot), values.offered ? "offered=true" : ""].filter(Boolean).join("&");
      const skills = await client.get<SkillInfo[]>(`/api/v1/skills${query ? `?${query}` : ""}`);
      if (ctx.json) return json(ctx.io, skills), 0;
      if (skills.length === 0) out(ctx.io, bot ? `No skills${values.offered ? " offered to" : " of"} ${bot}.` : "No account skills yet. Add one: orbis skills add ./SKILL.md");
      for (const s of skills) out(ctx.io, `${c.bold(`/${s.name}`)} ${c.dim(s.scope)}  ${s.description}`);
      return 0;
    }
    case "add": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { replace: { type: "boolean" } }, strict: true });
      const [file, bot] = positionals;
      if (!file) throw new UsageError("skills add needs a SKILL.md file (or - for stdin): orbis skills add ./release-notes/SKILL.md [@bot]");
      const content = await readContent(ctx, file);
      const q = botQuery(bot);
      let skill: Skill;
      if (values.replace) {
        const name = /^name:\s*(\S+)/m.exec(content)?.[1];
        if (!name) throw new UsageError("the file has no name: line in its frontmatter");
        skill = await client.request<Skill>("PUT", `/api/v1/skills/${encodeURIComponent(name)}${q ? `?${q}` : ""}`, { content });
      } else {
        skill = await client.post<Skill>("/api/v1/skills", { content, ...(bot ? { botId: bot.replace(/^@/, "") } : {}) });
      }
      if (ctx.json) return json(ctx.io, skill), 0;
      out(ctx.io, `${values.replace ? "Updated" : "Added"} /${skill.name} (${skill.scope}${bot ? ` of ${bot}` : ""}).`);
      return 0;
    }
    case "show": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      const [name, bot] = positionals;
      if (!name) throw new UsageError("skills show needs a skill name");
      const q = botQuery(bot);
      const skill = await client.get<Skill>(`/api/v1/skills/${encodeURIComponent(name.replace(/^\//, ""))}${q ? `?${q}` : ""}`);
      if (ctx.json) return json(ctx.io, skill), 0;
      ctx.io.stdout.write(skill.content);
      return 0;
    }
    case "remove":
    case "rm": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      const [name, bot] = positionals;
      if (!name) throw new UsageError("skills remove needs a skill name");
      const q = botQuery(bot);
      await client.delete(`/api/v1/skills/${encodeURIComponent(name.replace(/^\//, ""))}${q ? `?${q}` : ""}`);
      out(ctx.io, `Removed /${name.replace(/^\//, "")}.`);
      return 0;
    }
    default:
      throw new UsageError(`unknown skills subcommand "${sub}" (list, add, show, remove)`);
  }
}
