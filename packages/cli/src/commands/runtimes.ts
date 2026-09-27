// `orbis runtimes check` — which subscription CLIs the hub's machine has.
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

interface RuntimeHealth {
  kind: string;
  executable: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

export async function runtimesCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub] = args;
  if (sub !== undefined && sub !== "check") throw new UsageError(`unknown runtimes subcommand "${sub}" (check)`);
  const health = await ctx.client().get<RuntimeHealth[]>("/api/v1/runtimes/health");
  if (ctx.json) return json(ctx.io, health), 0;
  const c = paint(ctx.io);
  for (const h of health) {
    out(ctx.io, `${h.found ? c.green("✓") : c.red("✗")} ${c.bold(h.kind.padEnd(12))} ${h.found ? `${h.version ?? "?"}  ${c.dim(h.path ?? "")}` : c.dim(`"${h.executable}" not found on PATH`)}`);
  }
  out(ctx.io, c.dim("API brains (anthropic, openai) need a key or a local server; mock needs nothing."));
  return 0;
}
