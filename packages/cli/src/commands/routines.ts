// `orbis routines list|add|test|enable|disable|remove|runs` (specs/routines).
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import type { Routine, RoutineRun, Run } from "@orbis/shared";
import type { HubClient } from "../client.js";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint } from "../io.js";

function describe(r: Routine): string {
  const trigger = r.trigger.type === "cron" ? `cron "${r.trigger.cron}" ${r.trigger.timezone}` : `webhook ${r.webhookPath}`;
  const state = r.enabled ? (r.paused ? "paused" : "enabled") : "disabled";
  return `${r.id}  ${r.name}  ${trigger}  ${state}${r.approval === "draft_only" ? "  draft-only" : ""}${r.nextRunAt ? `  next ${r.nextRunAt}` : ""}`;
}

/** Wait until a run has ended (the hub's own timeout bounds it). */
async function waitRun(client: HubClient, runId: string): Promise<Run> {
  for (;;) {
    const run = await client.get<Run>(`/api/v1/runs/${runId}`);
    if (["done", "failed", "cancelled"].includes(run.status)) return run;
    await delay(300);
  }
}

export async function routinesCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  const c = paint(ctx.io);
  const idArg = (positionals: string[]) => {
    if (!positionals[0]) throw new UsageError(`routines ${sub} needs a routine id (orbis routines list @bot)`);
    return encodeURIComponent(positionals[0]);
  };
  switch (sub) {
    case "list":
    case "ls": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      if (!positionals[0]) throw new UsageError("routines list needs a bot: orbis routines list @ana");
      const routines = await client.get<Routine[]>(`/api/v1/bots/${encodeURIComponent(positionals[0].replace(/^@/, ""))}/routines`);
      if (ctx.json) return json(ctx.io, routines), 0;
      if (routines.length === 0) out(ctx.io, "No routines yet.");
      for (const r of routines) out(ctx.io, describe(r));
      return 0;
    }
    case "add":
    case "create": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          name: { type: "string" },
          cron: { type: "string" },
          tz: { type: "string" },
          webhook: { type: "boolean" },
          instruction: { type: "string" },
          "draft-only": { type: "boolean" },
        },
        strict: true,
      });
      const bot = positionals[0];
      if (!bot || !values.name || !values.instruction || (!values.cron && !values.webhook) || (values.cron && values.webhook)) {
        throw new UsageError('routines add @bot --name N (--cron "0 9 * * 1-5" [--tz America/Sao_Paulo] | --webhook) --instruction "…" [--draft-only]');
      }
      const routine = await client.post<Routine & { secret: string }>(`/api/v1/bots/${encodeURIComponent(bot.replace(/^@/, ""))}/routines`, {
        name: values.name,
        instruction: values.instruction,
        trigger: values.webhook ? { type: "webhook" } : { type: "cron", cron: values.cron, timezone: values.tz ?? "UTC" },
        approval: values["draft-only"] ? "draft_only" : "normal",
      });
      if (ctx.json) return json(ctx.io, routine), 0;
      out(ctx.io, `Created ${describe(routine)}`);
      if (routine.webhookPath) {
        out(ctx.io, `  POST ${routine.webhookPath} signed with X-Orbis-Signature (or X-Hub-Signature-256): sha256=HMAC(body, secret)`);
        out(ctx.io, `  secret: ${routine.secret}`);
      }
      out(ctx.io, c.dim(`  next: orbis routines test ${routine.id}, then orbis routines enable ${routine.id}`));
      return 0;
    }
    case "test": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { "no-wait": { type: "boolean" } }, strict: true });
      const record = await client.post<RoutineRun>(`/api/v1/routines/${idArg(positionals)}/test`);
      if (values["no-wait"] || !record.runId) {
        if (ctx.json) return json(ctx.io, record), 0;
        out(ctx.io, `Test run ${record.runId} started (draft-only).`);
        return 0;
      }
      const run = await waitRun(client, record.runId);
      if (ctx.json) return json(ctx.io, run), run.status === "done" ? 0 : 1;
      out(ctx.io, `Test run ${run.id}: ${run.status}${run.status === "done" ? "" : ` — ${run.error ?? ""}`}`);
      if (run.reply) out(ctx.io, run.reply);
      return run.status === "done" ? 0 : 1;
    }
    case "enable":
    case "disable": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: "boolean" } }, strict: true });
      const routine = await client.post<Routine>(`/api/v1/routines/${idArg(positionals)}/${sub}`, sub === "enable" && values.force ? { force: true } : {});
      if (ctx.json) return json(ctx.io, routine), 0;
      out(ctx.io, describe(routine));
      return 0;
    }
    case "remove":
    case "rm": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      await client.delete(`/api/v1/routines/${idArg(positionals)}`);
      out(ctx.io, `Removed ${positionals[0]}.`);
      return 0;
    }
    case "runs": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
      const runs = await client.get<RoutineRun[]>(`/api/v1/routines/${idArg(positionals)}/runs`);
      if (ctx.json) return json(ctx.io, runs), 0;
      if (runs.length === 0) out(ctx.io, "No runs yet.");
      for (const r of runs) out(ctx.io, `${r.startedAt}  ${r.status}${r.test ? " (test)" : ""}  ${c.dim(r.summary ?? "")}`);
      return 0;
    }
    default:
      throw new UsageError(`unknown routines subcommand "${sub ?? ""}" (list, add, test, enable, disable, remove, runs)`);
  }
}
