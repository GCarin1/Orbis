// `orbis mcp` — the stdio MCP bridge to the hub's /mcp endpoint (specs/cli, specs/tool-gateway).
// It reads the run token from ORBIS_RUN_TOKEN; stdout carries only JSON-RPC.
import { runMcpBridge, bridgeEnv } from "@orbis/hub";
import type { CommandContext } from "../context.js";
import { UsageError } from "../io.js";

export async function mcpCommand(_args: string[], ctx: CommandContext): Promise<number> {
  const env = bridgeEnv(ctx.io.env);
  if (!env.token) throw new UsageError("orbis mcp needs ORBIS_RUN_TOKEN (the hub sets it for each run)");
  const url = env.url ?? ctx.connection().url;
  await runMcpBridge({ url, token: env.token, input: ctx.io.stdin, output: ctx.io.stdout });
  return 0;
}
