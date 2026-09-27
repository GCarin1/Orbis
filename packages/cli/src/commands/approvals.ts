// `orbis approvals list|allow|deny`
import { parseArgs } from "node:util";
import type { Approval, Bot } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

export async function approvalsCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  const c = paint(ctx.io);
  switch (sub) {
    case undefined:
    case "list":
    case "ls": {
      const { values } = parseArgs({ args: rest, options: { all: { type: "boolean" } }, strict: true });
      const approvals = await client.get<Approval[]>(`/api/v1/approvals${values.all ? "" : "?status=pending"}`);
      if (ctx.json) return json(ctx.io, approvals), 0;
      if (approvals.length === 0) {
        out(ctx.io, values.all ? "No approvals yet." : "Nothing is waiting for you.");
        return 0;
      }
      const bots = new Map((await client.get<Bot[]>("/api/v1/bots?includeHidden=true")).map((b) => [b.id, b]));
      for (const a of approvals) {
        const bot = bots.get(a.botId);
        out(ctx.io, `${c.bold(a.id)}  ${a.status}  @${bot?.handle ?? a.botId} → ${c.cyan(a.tool)}  ${c.dim(JSON.stringify(a.input).slice(0, 120))}`);
      }
      return 0;
    }
    case "allow":
    case "deny": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { always: { type: "boolean" }, note: { type: "string" } },
        strict: true,
      });
      if (!positionals[0]) throw new UsageError(`approvals ${sub} needs an approval id (orbis approvals list)`);
      const decision = sub === "deny" ? "deny" : values.always ? "allow_always" : "allow_once";
      const approval = await client.post<Approval>(`/api/v1/approvals/${encodeURIComponent(positionals[0])}`, {
        decision,
        ...(values.note ? { note: values.note } : {}),
      });
      if (ctx.json) return json(ctx.io, approval), 0;
      out(ctx.io, `${approval.id}: ${approval.status} (${decision.replace("_", " ")})`);
      return 0;
    }
    default:
      throw new UsageError(`unknown approvals subcommand "${sub}" (list, allow, deny)`);
  }
}
