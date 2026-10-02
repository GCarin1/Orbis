// The stdio MCP bridge: newline-delimited JSON-RPC on stdin/stdout, forwarded to
// the hub's /mcp endpoint with a run token. `orbis mcp` and the hub's own
// bridge script (used by CLI brains) both run this.
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
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

/**
 * POST one message to the hub and read the whole answer. Plain node:http, not
 * fetch: fetch gives up on a response that takes over 5 minutes to start, and
 * a tool call waiting for the user's approval can take longer than that.
 */
export function postToHub(endpoint: string, token: string, body: string): Promise<{ status: number; text: string }> {
  const url = new URL(endpoint);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), authorization: `Bearer ${token}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

export async function runMcpBridge(opts: BridgeOptions): Promise<void> {
  const endpoint = `${opts.url.replace(/\/+$/, "")}/mcp`;
  const rl = createInterface({ input: opts.input, crlfDelay: Infinity });
  const write = (obj: unknown) => opts.output.write(JSON.stringify(obj) + "\n");

  const forward = async (line: string, id: string | number | null | undefined): Promise<void> => {
    try {
      const res = await postToHub(endpoint, opts.token, line);
      if (res.status === 202) return;
      if ((res.status < 200 || res.status >= 300) && id !== undefined) {
        let message = `hub answered HTTP ${res.status}`;
        try {
          message = (JSON.parse(res.text) as { error?: { message?: string } }).error?.message ?? message;
        } catch {
          /* keep the status message */
        }
        write({ jsonrpc: "2.0", id, error: { code: -32001, message } });
        return;
      }
      if (res.text && id !== undefined) opts.output.write(res.text.trim() + "\n");
    } catch (err) {
      if (id !== undefined) {
        write({ jsonrpc: "2.0", id, error: { code: -32000, message: `cannot reach the Orbis hub: ${err instanceof Error ? err.message : String(err)}` } });
      }
    }
  };

  // Tool calls are forwarded as they arrive, so one waiting for an approval
  // does not hold up the brain's other calls; the rest keep their order.
  const inflight = new Set<Promise<void>>();
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: { id?: string | number | null; method?: string };
    try {
      msg = JSON.parse(line) as { id?: string | number | null; method?: string };
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    const call = forward(line, msg.id);
    if (msg.method !== "tools/call") {
      await call;
      continue;
    }
    inflight.add(call);
    void call.finally(() => inflight.delete(call));
  }
  await Promise.all([...inflight]);
}
