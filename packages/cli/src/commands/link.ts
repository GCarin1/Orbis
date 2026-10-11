// `orbis link` and `orbis unlink` (specs/cli, change 0066-runner-link): make this hub a device of an Orbis
// account. The account's email and password are typed at prompts (the password hidden) or piped on stdin, never
// passed as arguments (shell history); the hub signs in itself and keeps only the device's own token.
// `--cloud <url>` names the Orbis cloud the hub relays to (change 0068-cloud-relay; `default` for the published one).
import { hostname } from "node:os";
import { parseArgs } from "node:util";
import type { DeviceStatus } from "@orbis/shared";
import type { CommandContext } from "../context.js";
import { UsageError, json, out } from "../io.js";
import { hiddenLine } from "./secrets.js";

function show(ctx: CommandContext, s: DeviceStatus): void {
  if (ctx.json) return json(ctx.io, s);
  if (!s.available) return out(ctx.io, "This hub takes no accounts (ORBIS_SUPABASE_URL=off).");
  if (!s.linked) return out(ctx.io, "Not linked to an account. Run: orbis link");
  out(ctx.io, `Device "${s.linked.name}" of ${s.linked.email ?? s.linked.ownerId}, since ${s.linked.linkedAt}`);
  if (s.revoked) return out(ctx.io, "The account revoked this device: nothing is sent. Run: orbis unlink, then orbis link");
  out(ctx.io, `waiting to send: ${s.pending}   last sync: ${s.lastSyncAt ?? "not yet"}`);
  if (s.lastError) out(ctx.io, `last error: ${s.lastError}`);
  if (!s.cloud.url) out(ctx.io, "cloud: none (choose one: orbis link --cloud https://…)");
  else out(ctx.io, `cloud: ${s.cloud.connected ? "connected" : "disconnected"} (${s.cloud.url})${!s.cloud.connected && s.cloud.lastError ? ` — ${s.cloud.lastError}` : ""}`);
}

/** Email then password, from prompts in a terminal, else the first two lines of stdin. */
async function credentials(ctx: CommandContext, email: string | undefined): Promise<{ email: string; password: string }> {
  if (ctx.io.interactive) {
    const e = email ?? (await hiddenLine(ctx.io, "Orbis account email: ", true));
    return { email: e.trim(), password: await hiddenLine(ctx.io, "password (hidden): ") };
  }
  let text = "";
  for await (const chunk of ctx.io.stdin) text += chunk;
  const lines = text.split(/\r?\n/);
  return email ? { email, password: lines[0] ?? "" } : { email: (lines[0] ?? "").trim(), password: lines[1] ?? "" };
}

export async function linkCommand(args: string[], ctx: CommandContext): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { name: { type: "string" }, email: { type: "string" }, status: { type: "boolean" }, sync: { type: "boolean" }, cloud: { type: "string" } },
    strict: true,
  });
  const client = ctx.client();
  if (values.status) return show(ctx, await client.get<DeviceStatus>("/api/v1/device")), 0;
  if (values.sync) return show(ctx, await client.post<DeviceStatus>("/api/v1/device/sync", {})), 0;
  // The cloud this device relays to (change 0068): set now when already linked, else with the link below.
  const cloudUrl = values.cloud === undefined ? undefined : values.cloud === "default" ? null : values.cloud;
  if (cloudUrl !== undefined) {
    const current = await client.get<DeviceStatus>("/api/v1/device");
    if (current.linked && !current.revoked) return show(ctx, await client.put<DeviceStatus>("/api/v1/device/cloud", { url: cloudUrl })), 0;
  }
  const { email, password } = await credentials(ctx, values.email);
  if (!email || !password) throw new UsageError("orbis link needs the account's email and password");
  const name = (values.name ?? `Orbis — ${hostname() === "localhost" ? "celular" : hostname()}`).slice(0, 80);
  const status = await client.post<DeviceStatus>("/api/v1/device/link", { name, email, password, ...(cloudUrl ? { cloudUrl } : {}) });
  if (!ctx.json) out(ctx.io, "Linked. This hub now sends its data to your account; its keys stay here.");
  show(ctx, status);
  return 0;
}

export async function unlinkCommand(_args: string[], ctx: CommandContext): Promise<number> {
  const status = await ctx.client().delete<DeviceStatus>("/api/v1/device");
  if (!ctx.json) out(ctx.io, "Unlinked: the device's token no longer works, and nothing more is sent.");
  show(ctx, status);
  return 0;
}
