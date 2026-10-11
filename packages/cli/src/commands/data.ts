// `orbis data export|import` (specs/cli, change 0069-server-runner): move a hub's data as one `.orbis` file, for
// example from the phone to a server, straight to the hub (never through the cloud's relay). The export's
// password seals the secrets; it is typed at a hidden prompt or piped on stdin, never passed as an argument.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { ImportReport } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out } from "../io.js";
import { hiddenLine } from "./secrets.js";

/** The export's password: at a hidden prompt in a terminal, else the first line of stdin. */
async function password(ctx: CommandContext, prompt: string): Promise<string> {
  if (ctx.io.interactive) return hiddenLine(ctx.io, prompt);
  let text = "";
  for await (const chunk of ctx.io.stdin) text += chunk;
  return text.split(/\r?\n/)[0] ?? "";
}

export async function dataCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    options: { out: { type: "string", short: "o" }, password: { type: "boolean" } },
    allowPositionals: true,
    strict: true,
  });
  const client = ctx.client();
  if (sub === "export") {
    const secret = values.password ? await password(ctx, "export password, at least 10 characters (hidden): ") : undefined;
    if (secret !== undefined && secret.length < 10) throw new UsageError("the export password needs at least 10 characters");
    const bytes = await client.bytes("POST", "/api/v1/export", secret ? { password: secret } : {});
    const file = values.out ?? `orbis-${new Date().toISOString().slice(0, 10)}.orbis`;
    await writeFile(file, bytes, { mode: 0o600 });
    if (ctx.json) json(ctx.io, { file, bytes: bytes.length, secrets: Boolean(secret) });
    else out(ctx.io, `Saved ${file} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)${secret ? ", secrets sealed by your password" : ", without the secrets (add --password to carry them)"}.`);
    return 0;
  }
  if (sub === "import") {
    const file = positionals[0];
    if (!file) throw new UsageError("orbis data import <file.orbis> [--password]");
    const body = new Uint8Array(await readFile(file));
    const secret = values.password ? await password(ctx, "the export's password (hidden): ") : undefined;
    const answer = await client.bytes("POST", "/api/v1/import", body, secret ? { "x-orbis-export-password": encodeURIComponent(secret) } : {});
    const report = JSON.parse(new TextDecoder().decode(answer)) as ImportReport;
    if (ctx.json) return json(ctx.io, report), 0;
    out(ctx.io, `Imported ${file} (exported ${report.exportedAt}):`);
    for (const [table, n] of Object.entries(report.tables)) if (n.added || n.skipped) out(ctx.io, `  ${table.padEnd(22)} ${n.added} added, ${n.skipped} already here`);
    out(ctx.io, `  files                  ${report.files.added} added, ${report.files.skipped} already here`);
    out(ctx.io, `  skills                 ${report.skills.added} added, ${report.skills.skipped} already here`);
    if (report.secrets.inFile) out(ctx.io, report.secrets.opened ? `  secrets                ${report.secrets.added} added` : "  secrets                left out: run again with --password");
    for (const w of report.warnings) out(ctx.io, `  ! ${w}`);
    return 0;
  }
  throw new UsageError("orbis data export [-o file.orbis] [--password] | import <file.orbis> [--password]");
}
