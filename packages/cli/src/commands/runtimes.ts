// `orbis runtimes check` — which brains the hub's machine has: subscription
// CLIs and local model servers. `orbis runtimes test` — ask a brain the test
// question and show its answer (specs/agent-runtimes).
import { parseArgs } from "node:util";
import { BRAIN_KINDS, BRAIN_TEST_QUESTION, type BrainKind, type BrainTestResult, type LocalModelServer, type RuntimeHealth } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

async function check(ctx: CommandContext): Promise<number> {
  const client = ctx.client();
  const [health, local] = await Promise.all([
    client.get<RuntimeHealth[]>("/api/v1/runtimes/health"),
    client.get<LocalModelServer[]>("/api/v1/runtimes/local"),
  ]);
  if (ctx.json) return json(ctx.io, { cli: health, local }), 0;
  const c = paint(ctx.io);
  out(ctx.io, c.bold("Subscription CLIs (your own login, no API key)"));
  for (const h of health) {
    out(ctx.io, `  ${h.found ? c.green("✓") : c.red("✗")} ${c.bold(h.kind.padEnd(12))} ${h.found ? `${h.version ?? "?"}  ${c.dim(h.path ?? "")}` : c.dim(`"${h.executable}" not found on PATH`)}`);
  }
  out(ctx.io, c.bold("Local model servers (no key)"));
  for (const s of local) {
    const models = s.models.length ? `${s.models.length} models: ${s.models.slice(0, 6).join(", ")}${s.models.length > 6 ? ", …" : ""}` : "no models";
    out(ctx.io, `  ${s.reachable ? c.green("✓") : c.red("✗")} ${c.bold(s.kind.padEnd(12))} ${s.reachable ? `${models}  ${c.dim(s.baseUrl)}` : c.dim(s.error ?? `not reachable at ${s.baseUrl}`)}`);
  }
  out(ctx.io, c.dim("Prove one answers: orbis runtimes test <kind> [--model M], or orbis runtimes test @bot."));
  return 0;
}

async function test(args: string[], ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { model: { type: "string" }, "base-url": { type: "string" }, command: { type: "string" } },
    strict: true,
  });
  const target = positionals[0];
  if (!target) throw new UsageError(`runtimes test needs a brain kind (${BRAIN_KINDS.join(", ")}) or @bot`);
  let body: Record<string, unknown>;
  if (target.startsWith("@")) {
    body = { botId: target.slice(1) };
  } else {
    if (!(BRAIN_KINDS as readonly string[]).includes(target)) throw new UsageError(`unknown brain "${target}" (${BRAIN_KINDS.join(", ")})`);
    body = {
      brain: {
        kind: target as BrainKind,
        ...(values.model ? { model: values.model } : {}),
        ...(values["base-url"] ? { baseUrl: values["base-url"] } : {}),
        ...(values.command ? { command: values.command } : {}),
      },
    };
  }
  const c = paint(ctx.io);
  if (!ctx.json) out(ctx.io, c.dim(`Asking ${target}: "${BRAIN_TEST_QUESTION}"`));
  const result = await ctx.client().post<BrainTestResult>("/api/v1/runtimes/test", body);
  if (ctx.json) return json(ctx.io, result), result.ok ? 0 : 1;
  const seconds = `${(result.durationMs / 1000).toFixed(1)}s`;
  if (!result.ok) {
    out(ctx.io, `${c.red("✗")} ${result.kind} failed after ${seconds}: ${result.error}`);
    return 1;
  }
  out(ctx.io, `${c.green("✓")} ${result.kind} answered in ${seconds}: ${result.reply}`);
  if (!result.answered) out(ctx.io, c.dim("  The reply does not hold 391: no model answered (the mock brain only echoes)."));
  return 0;
}

export async function runtimesCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === "check") return check(ctx);
  if (sub === "test") return test(rest, ctx);
  throw new UsageError(`unknown runtimes subcommand "${sub}" (check, test)`);
}
