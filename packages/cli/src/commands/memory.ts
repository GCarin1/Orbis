// `orbis memory list|add|edit|rm` — what a bot, or the whole team, remembers (specs/memory).
import { parseArgs } from "node:util";
import { MEMORY_KINDS, type Bot, type MemoryEntry, type MemoryKind } from "@orbis/shared";
import type { HubClient } from "../client.js";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

function kindOf(value: string | undefined): MemoryKind | undefined {
  if (value === undefined) return undefined;
  if (!(MEMORY_KINDS as readonly string[]).includes(value)) throw new UsageError(`--kind must be one of ${MEMORY_KINDS.join(", ")}`);
  return value as MemoryKind;
}

/** `@ana` → that bot's entries; `--team` → the team's. */
async function scopePath(client: HubClient, bot: string | undefined, team: boolean | undefined): Promise<string> {
  if (team && bot) throw new UsageError("give a bot or --team, not both");
  if (team) return "/api/v1/memory";
  if (!bot) throw new UsageError("which memory? give a bot (@ana) or --team");
  const found = await client.get<Bot>(`/api/v1/bots/${encodeURIComponent(bot.replace(/^@/, ""))}`);
  return `/api/v1/bots/${found.id}/memory`;
}

export async function memoryCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  const c = paint(ctx.io);
  switch (sub) {
    case "list":
    case "ls": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { team: { type: "boolean" }, kind: { type: "string" } },
        strict: true,
      });
      const path = await scopePath(client, positionals[0], values.team);
      const kind = kindOf(values.kind);
      const entries = (await client.get<MemoryEntry[]>(values.team ? `${path}?scope=team` : path)).filter((m) => !kind || m.kind === kind);
      if (ctx.json) return json(ctx.io, entries), 0;
      if (entries.length === 0) out(ctx.io, "Nothing remembered yet.");
      for (const m of entries) out(ctx.io, `${c.bold(m.id)}  ${c.cyan(m.kind)}  ${c.dim(m.updatedAt.slice(0, 16).replace("T", " "))}\n  ${m.text.split("\n").join("\n  ")}`);
      return 0;
    }
    case "add": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { team: { type: "boolean" }, kind: { type: "string" } },
        strict: true,
      });
      const [first, ...words] = values.team ? [undefined, ...positionals] : positionals;
      const text = words.join(" ").trim();
      if (!text) throw new UsageError('memory add needs a bot (or --team) and the text: orbis memory add @ana "prefers reports in Portuguese" --kind preference');
      const entry = await client.post<MemoryEntry>(await scopePath(client, first, values.team), { kind: kindOf(values.kind) ?? "fact", text });
      if (ctx.json) return json(ctx.io, entry), 0;
      out(ctx.io, `Saved ${entry.kind} ${entry.id}${entry.botId === null ? " for the whole team" : ""}.`);
      return 0;
    }
    case "edit": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { kind: { type: "string" } }, strict: true });
      const [id, ...words] = positionals;
      const text = words.join(" ").trim();
      if (!id || (!text && !values.kind)) throw new UsageError('memory edit needs an id and new text or --kind: orbis memory edit mem_… "new text"');
      const entry = await client.patch<MemoryEntry>(`/api/v1/memory/${encodeURIComponent(id)}`, {
        ...(text ? { text } : {}),
        ...(values.kind ? { kind: kindOf(values.kind) } : {}),
      });
      if (ctx.json) return json(ctx.io, entry), 0;
      out(ctx.io, `Updated ${entry.id}.`);
      return 0;
    }
    case "rm":
    case "remove":
    case "delete": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      if (positionals.length === 0) throw new UsageError("memory rm needs one or more entry ids (orbis memory list @ana)");
      for (const id of positionals) await client.delete(`/api/v1/memory/${encodeURIComponent(id)}`);
      out(ctx.io, `Forgot ${positionals.length === 1 ? positionals[0] : `${positionals.length} entries`}.`);
      return 0;
    }
    default:
      throw new UsageError(`unknown memory subcommand "${sub ?? ""}" (list, add, edit, rm)`);
  }
}
