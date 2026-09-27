// MCP over HTTP (JSON-RPC 2.0): initialize, ping, tools/list, tools/call (specs/tool-gateway).
import type { FastifyInstance } from "fastify";
import { ORBIS_VERSION } from "@orbis/shared";
import type { RunSession, ToolGateway } from "../tools/gateway.js";
import { toWireName } from "../tools/registry.js";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const error = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** Handle one JSON-RPC message for a run session; null for notifications. */
export async function handleMcp(msg: JsonRpcRequest, session: RunSession, gateway: ToolGateway): Promise<JsonRpcResponse | null> {
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : error(msg.id, -32600, "invalid request");
  }
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? MCP_PROTOCOL_VERSION);
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "orbis", version: ORBIS_VERSION },
          instructions: `Orbis tools for @${session.bot.handle}. Risky tools wait for the user's approval.`,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id: msg.id ?? null, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          tools: gateway.toolsFor(session.bot).map((t) => ({
            name: toWireName(t.name),
            description: t.description,
            inputSchema: t.input,
          })),
        },
      };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as unknown;
      const result = await gateway.execute(session, name, args, String(msg.id ?? name));
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: { content: [{ type: "text", text: result.output }], isError: result.isError },
      };
    }
    default:
      if (msg.method.startsWith("notifications/")) return null;
      return isNotification ? null : error(msg.id, -32601, `method not found: ${msg.method}`);
  }
}

export async function registerMcp(app: FastifyInstance, gateway: ToolGateway): Promise<void> {
  app.post("/mcp", { schema: { hide: true } }, async (req, reply) => {
    const header = req.headers.authorization ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    const session = token ? gateway.session(token) : undefined;
    if (!session) {
      return reply.code(401).send({ error: { code: "unauthorized", message: "missing, unknown or revoked run token" } });
    }
    const body = req.body as JsonRpcRequest | JsonRpcRequest[];
    if (Array.isArray(body)) {
      return reply.code(400).send(error(null, -32600, "batch requests are not supported"));
    }
    const response = await handleMcp(body, session, gateway);
    if (response === null) return reply.code(202).send();
    return reply.type("application/json").send(response);
  });

  app.get("/mcp", { schema: { hide: true } }, async (_req, reply) =>
    reply.code(405).header("allow", "POST").send({ error: { code: "method_not_allowed", message: "the Orbis MCP endpoint offers no server-sent stream" } }),
  );
}
