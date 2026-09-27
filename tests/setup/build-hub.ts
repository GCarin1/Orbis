// CLI brains start the hub's compiled stdio MCP bridge (dist/mcp-bridge.js).
// Build it once before the hub and CLI tests when a fresh checkout has no dist yet.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export default function setup(): void {
  const root = path.resolve(import.meta.dirname, "../..");
  if (existsSync(path.join(root, "packages/hub/dist/mcp-bridge.js"))) return;
  execFileSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-b", "packages/shared", "packages/hub"], {
    cwd: root,
    stdio: "inherit",
  });
}
