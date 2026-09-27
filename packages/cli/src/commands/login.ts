// `orbis login` and `orbis open`.
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import type { CommandContext } from "../context.js";
import { configFilePath, readConfigFile, writeConfigFile } from "../config.js";
import { HubClient } from "../client.js";
import { UsageError, json, out } from "../io.js";

export async function loginCommand(args: string[], ctx: CommandContext): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: "string" },
      token: { type: "string" },
      "show-token": { type: "boolean" },
      status: { type: "boolean" },
    },
    strict: true,
  });
  if (values["show-token"]) {
    const conn = ctx.connection();
    if (!conn.token) throw new UsageError("no token found; run orbis login --url <hub> --token <token>");
    out(ctx.io, conn.token);
    return 0;
  }
  if (values.status || (!values.url && !values.token)) {
    const conn = ctx.connection();
    const status = { url: conn.url, urlFrom: conn.source.url, token: conn.token ? "set" : "missing", tokenFrom: conn.source.token };
    if (ctx.json) return json(ctx.io, status), 0;
    out(ctx.io, `hub:   ${status.url}  (${status.urlFrom})`);
    out(ctx.io, `token: ${status.token}  (${status.tokenFrom})`);
    return 0;
  }
  const current = readConfigFile(ctx.io.env);
  const next = { ...current, ...(values.url ? { url: values.url.replace(/\/+$/, "") } : {}), ...(values.token ? { token: values.token } : {}) };
  // Check the credentials before saving them.
  await new HubClient({ url: next.url ?? ctx.connection().url, token: next.token ?? null, source: { url: "login", token: "login" } }).get("/api/v1/bots");
  const file = writeConfigFile(ctx.io.env, next);
  out(ctx.io, `Saved ${file}`);
  return 0;
}

export async function openCommand(_args: string[], ctx: CommandContext): Promise<number> {
  const conn = ctx.connection();
  const url = `${conn.url}/${conn.token ? `#token=${encodeURIComponent(conn.token)}` : ""}`;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { stdio: "ignore", detached: true });
  child.on("error", () => out(ctx.io, `Open ${conn.url}/ in your browser (config: ${configFilePath(ctx.io.env)})`));
  child.unref();
  out(ctx.io, `Opening ${conn.url}/`);
  return 0;
}
