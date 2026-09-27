#!/usr/bin/env node
// The stdio MCP server CLI brains start (contracts/cli-harnesses). Same code as `orbis mcp`.
import { bridgeEnv, runMcpBridge } from "./mcp/bridge.js";

const { url, token } = bridgeEnv(process.env);
if (!url || !token) {
  process.stderr.write("orbis mcp bridge: ORBIS_URL and ORBIS_RUN_TOKEN are required\n");
  process.exit(2);
}
await runMcpBridge({ url, token, input: process.stdin, output: process.stdout });
