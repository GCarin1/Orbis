// `orbis bots list|create|show|edit|delete|duplicate`
import { parseArgs } from "node:util";
import { BRAIN_KINDS, type Bot, type BrainKind } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

const botPath = (ref: string) => `/api/v1/bots/${encodeURIComponent(ref.replace(/^@/, ""))}`;

function brainKind(value: string | undefined): BrainKind | undefined {
  if (value === undefined) return undefined;
  if (!(BRAIN_KINDS as readonly string[]).includes(value)) {
    throw new UsageError(`--brain must be one of ${BRAIN_KINDS.join(", ")}`);
  }
  return value as BrainKind;
}

export function formatBot(ctx: CommandContext, bot: Bot): string {
  const c = paint(ctx.io);
  const flags = [bot.pinned ? "pinned" : "", bot.hidden ? "hidden" : ""].filter(Boolean).join(", ");
  return [
    `${c.bold(bot.name)} ${c.dim(`@${bot.handle}`)}${bot.role ? ` — ${bot.role}` : ""}`,
    `  state: ${bot.state}   brain: ${bot.brain.kind}${bot.brain.model ? ` (${bot.brain.model})` : ""}${flags ? `   ${flags}` : ""}`,
    `  id: ${bot.id}${bot.spendCapUsd !== null ? `   spend cap: $${bot.spendCapUsd}/month` : ""}`,
    ...(bot.description ? [`  ${bot.description.split("\n").join("\n  ")}`] : []),
  ].join("\n");
}

const brainOptions = {
  brain: { type: "string" },
  model: { type: "string" },
  command: { type: "string" },
  "base-url": { type: "string" },
  "api-key-secret": { type: "string" },
} as const;

function brainFrom(values: Record<string, unknown>, current?: Bot["brain"]): Bot["brain"] | undefined {
  const kind = brainKind(values.brain as string | undefined);
  const touched = ["brain", "model", "command", "base-url", "api-key-secret"].some((k) => values[k] !== undefined);
  if (!touched) return undefined;
  return {
    ...(current ?? { kind: "claude-code" }),
    ...(kind ? { kind } : {}),
    ...(values.model !== undefined ? { model: values.model as string } : {}),
    ...(values.command !== undefined ? { command: values.command as string } : {}),
    ...(values["base-url"] !== undefined ? { baseUrl: values["base-url"] as string } : {}),
    ...(values["api-key-secret"] !== undefined ? { apiKeySecret: values["api-key-secret"] as string } : {}),
  };
}

export async function botsCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  switch (sub) {
    case "list":
    case "ls":
    case undefined: {
      const { values } = parseArgs({ args: rest, options: { all: { type: "boolean" } }, strict: true });
      const bots = await client.get<Bot[]>(`/api/v1/bots${values.all ? "?includeHidden=true" : ""}`);
      if (ctx.json) return json(ctx.io, bots), 0;
      if (bots.length === 0) out(ctx.io, "No bots yet. Create one: orbis bots create --name \"Ana\" --role \"QA\"");
      for (const bot of bots) out(ctx.io, formatBot(ctx, bot) + "\n");
      return 0;
    }
    case "create":
    case "new": {
      const { values } = parseArgs({
        args: rest,
        options: {
          name: { type: "string" },
          handle: { type: "string" },
          role: { type: "string" },
          description: { type: "string" },
          "spend-cap": { type: "string" },
          ...brainOptions,
        },
        strict: true,
      });
      if (!values.name) throw new UsageError("bots create needs --name");
      const bot = await client.post<Bot>("/api/v1/bots", {
        name: values.name,
        ...(values.handle ? { handle: values.handle } : {}),
        ...(values.role ? { role: values.role } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values["spend-cap"] ? { spendCapUsd: Number(values["spend-cap"]) } : {}),
        ...(brainFrom(values) ? { brain: brainFrom(values) } : {}),
      });
      if (ctx.json) return json(ctx.io, bot), 0;
      out(ctx.io, `Created ${formatBot(ctx, bot)}`);
      out(ctx.io, `\nTalk to it: orbis chat @${bot.handle} "hello"`);
      return 0;
    }
    case "show":
    case "get": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      if (!positionals[0]) throw new UsageError("bots show needs a bot (@handle or id)");
      const bot = await client.get<Bot>(botPath(positionals[0]));
      if (ctx.json) return json(ctx.io, bot), 0;
      out(ctx.io, formatBot(ctx, bot));
      return 0;
    }
    case "edit":
    case "set": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          name: { type: "string" },
          handle: { type: "string" },
          role: { type: "string" },
          description: { type: "string" },
          "spend-cap": { type: "string" },
          pin: { type: "boolean" },
          unpin: { type: "boolean" },
          hide: { type: "boolean" },
          unhide: { type: "boolean" },
          ...brainOptions,
        },
        strict: true,
      });
      if (!positionals[0]) throw new UsageError("bots edit needs a bot (@handle or id)");
      const current = await client.get<Bot>(botPath(positionals[0]));
      const brain = brainFrom(values, current.brain);
      const patch = {
        ...(values.name !== undefined ? { name: values.name } : {}),
        ...(values.handle !== undefined ? { handle: values.handle } : {}),
        ...(values.role !== undefined ? { role: values.role } : {}),
        ...(values.description !== undefined ? { description: values.description } : {}),
        ...(values["spend-cap"] !== undefined ? { spendCapUsd: values["spend-cap"] === "none" ? null : Number(values["spend-cap"]) } : {}),
        ...(values.pin ? { pinned: true } : values.unpin ? { pinned: false } : {}),
        ...(values.hide ? { hidden: true } : values.unhide ? { hidden: false } : {}),
        ...(brain ? { brain } : {}),
      };
      const bot = await client.patch<Bot>(botPath(current.id), patch);
      if (ctx.json) return json(ctx.io, bot), 0;
      out(ctx.io, `Updated ${formatBot(ctx, bot)}`);
      return 0;
    }
    case "duplicate":
    case "copy": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      if (!positionals[0]) throw new UsageError("bots duplicate needs a bot (@handle or id)");
      const bot = await client.post<Bot>(`${botPath(positionals[0])}/duplicate`);
      if (ctx.json) return json(ctx.io, bot), 0;
      out(ctx.io, `Created ${formatBot(ctx, bot)}`);
      return 0;
    }
    case "delete":
    case "rm": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { yes: { type: "boolean", short: "y" } },
        strict: true,
      });
      if (!positionals[0]) throw new UsageError("bots delete needs a bot (@handle or id)");
      if (!values.yes) {
        throw new UsageError(
          `deleting a bot destroys its memory, routines, secrets and computer; repeat with --yes to confirm`,
        );
      }
      await client.delete(botPath(positionals[0]));
      if (ctx.json) return json(ctx.io, { deleted: positionals[0] }), 0;
      out(ctx.io, `Deleted ${positionals[0]}`);
      return 0;
    }
    default:
      throw new UsageError(`unknown bots subcommand "${sub}" (list, create, show, edit, delete, duplicate)`);
  }
}
