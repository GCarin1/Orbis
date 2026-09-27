// The stdio MCP bridge: newline-delimited JSON-RPC on stdin/stdout, forwarded to
// the hub's /mcp endpoint with a run token. `orbis mcp` and the hub's own
// bridge script (used by CLI brains) both run this.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export interface BridgeOptions {
  url: string;
  token: string;
  input: Readable;
  output: Writable;
}

/** Read ORBIS_URL and ORBIS_RUN_TOKEN, treating empty values as unset. */
export function bridgeEnv(env: Record<string, string | undefined>): { url: string | null; token: string | null } {
  const read = (name: string) => (env[name] && env[name]!.trim() ? env[name]!.trim() : null);
  return { url: read("ORBIS_URL"), token: read("ORBIS_RUN_TOKEN") };
}

export async function runMcpBridge(opts: BridgeOptions): Promise<void> {
  const endpoint = `${opts.url.replace(/\/+$/, "")}/mcp`;
  const rl = createInterface({ input: opts.input, crlfDelay: Infinity });
  const write = (obj: unknown) => opts.output.write(JSON.stringify(obj) + "\n");

  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: { id?: string | number | null };
    try {
      msg = JSON.parse(line) as { id?: string | number | null };
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
        body: line,
      });
      if (res.status === 202) continue;
      const text = await res.text();
      if (!res.ok && msg.id !== undefined) {
        let message = `hub answered HTTP ${res.status}`;
        try {
          message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
        } catch {
          /* keep the status message */
        }
        write({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message } });
        continue;
      }
      if (text && msg.id !== undefined) opts.output.write(text.trim() + "\n");
    } catch (err) {
      if (msg.id !== undefined) {
        write({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `cannot reach the Orbis hub: ${err instanceof Error ? err.message : String(err)}` } });
      }
    }
  }
}
