// `orbis group create|list|chat|add|remove|delete` (specs/cli, specs/conversations).
import { parseArgs } from "node:util";
import type { Bot, Conversation } from "@orbis/shared";
import type { HubClient } from "../client.js";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";
import { converse } from "./chat.js";

const botRef = (ref: string) => ref.replace(/^@/, "");

/** Find a group by id or by title (case-insensitive). */
export async function resolveGroup(client: HubClient, ref: string): Promise<Conversation> {
  if (/^cnv_/.test(ref)) return client.get<Conversation>(`/api/v1/conversations/${encodeURIComponent(ref)}`);
  const groups = (await client.get<Conversation[]>("/api/v1/conversations")).filter((c) => c.kind === "group");
  const wanted = ref.trim().toLowerCase();
  const matches = groups.filter((g) => g.title.toLowerCase() === wanted);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new UsageError(`more than one group is called "${ref}"; use its id (orbis group list)`);
  throw new UsageError(`no group called "${ref}" (orbis group list)`);
}

function formatGroup(ctx: CommandContext, group: Conversation, bots: Map<string, Bot>): string {
  const c = paint(ctx.io);
  const members = group.members.map((id) => {
    const handle = `@${bots.get(id)?.handle ?? id}`;
    return id === group.leadBotId ? `${handle} (lead)` : handle;
  });
  return `${c.bold(group.title)} ${c.dim(group.id)}\n  ${members.join(", ")}`;
}

async function botsById(client: HubClient): Promise<Map<string, Bot>> {
  return new Map((await client.get<Bot[]>("/api/v1/bots?includeHidden=true")).map((b) => [b.id, b]));
}

export async function groupCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  switch (sub) {
    case undefined:
    case "list":
    case "ls": {
      parseArgs({ args: rest, options: {}, strict: true });
      const groups = (await client.get<Conversation[]>("/api/v1/conversations")).filter((c) => c.kind === "group");
      if (ctx.json) return json(ctx.io, groups), 0;
      if (groups.length === 0) {
        out(ctx.io, 'No groups yet. Create one: orbis group create "Release" @ana @bob');
        return 0;
      }
      const bots = await botsById(client);
      for (const group of groups) out(ctx.io, formatGroup(ctx, group, bots) + "\n");
      return 0;
    }
    case "create":
    case "new": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { lead: { type: "string" } }, strict: true });
      const [title, ...members] = positionals;
      if (!title || members.length < 2) throw new UsageError('group create needs a title and at least two bots: orbis group create "Release" @ana @bob');
      const group = await client.post<Conversation>("/api/v1/conversations", {
        title,
        members: members.map(botRef),
        ...(values.lead ? { leadBotId: botRef(values.lead) } : {}),
      });
      if (ctx.json) return json(ctx.io, group), 0;
      out(ctx.io, formatGroup(ctx, group, await botsById(client)));
      return 0;
    }
    case "chat": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      const [ref, ...words] = positionals;
      if (!ref) throw new UsageError('group chat needs a group: orbis group chat Release "@ana check the logs"');
      const group = await resolveGroup(client, ref);
      const bots = await botsById(client);
      const members = group.members.map((id) => `@${bots.get(id)?.handle ?? id}`).join(", ");
      return converse(ctx, group, words, `In ${group.title} with ${members}. Mention a bot, @everyone, or talk to the lead.`);
    }
    case "add":
    case "remove":
    case "rm": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      const [ref, bot] = positionals;
      if (!ref || !bot) throw new UsageError(`group ${sub} needs a group and a bot: orbis group ${sub} Release @cara`);
      const group = await resolveGroup(client, ref);
      const updated =
        sub === "add"
          ? await client.post<Conversation>(`/api/v1/conversations/${group.id}/members`, { botId: botRef(bot) })
          : await client.delete<Conversation>(`/api/v1/conversations/${group.id}/members/${encodeURIComponent(botRef(bot))}`);
      if (ctx.json) return json(ctx.io, updated), 0;
      out(ctx.io, formatGroup(ctx, updated, await botsById(client)));
      return 0;
    }
    case "delete": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      if (!positionals[0]) throw new UsageError("group delete needs a group");
      const group = await resolveGroup(client, positionals[0]);
      await client.delete(`/api/v1/conversations/${group.id}`);
      out(ctx.io, `Deleted ${group.title}.`);
      return 0;
    }
    default:
      throw new UsageError(`unknown group subcommand "${sub}" (list, create, chat, add, remove, delete)`);
  }
}

