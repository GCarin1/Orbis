// REST surface of the MCP marketplace and connected servers (contracts/hub-surface).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { HttpError } from "../errors.js";
import type { McpConnections } from "./connections.js";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The page the browser lands on after signing in to a server. */
function callbackPage(title: string, text: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f5f5f7;color:#111}main{max-width:420px;padding:28px;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgb(0 0 0/8%);text-align:center}h1{font-size:20px;margin:0 0 8px;color:${ok ? "#15803d" : "#dc2626"}}
@media(prefers-color-scheme:dark){body{background:#121216;color:#ececf1}main{background:#18181d}}</style></head>
<body><main><h1>${escape(title)}</h1><p>${escape(text)}</p></main><script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script></body></html>`;
}

export async function registerMcpRoutes(root: FastifyInstance, mcp: McpConnections): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();
  const Id = Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }) });
  const Connect = Type.Object(
    {
      catalogId: Type.Optional(Type.String({ maxLength: 64 })),
      values: Type.Optional(Type.Record(Type.String(), Type.String({ maxLength: 4000 }))),
      name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
      transport: Type.Optional(Type.Union([Type.Literal("stdio"), Type.Literal("http")])),
      command: Type.Optional(Type.String({ maxLength: 1000 })),
      args: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 50 })),
      url: Type.Optional(Type.String({ maxLength: 2000 })),
      env: Type.Optional(Type.Record(Type.String(), Type.String({ maxLength: 4000 }))),
      token: Type.Optional(Type.String({ maxLength: 4000 })),
    },
    { additionalProperties: false },
  );
  const Access = Type.Object({ botId: Type.String({ minLength: 1 }), enabled: Type.Boolean() }, { additionalProperties: false });

  app.get("/api/v1/mcp/catalog", { schema: { tags: ["mcp"] } }, async () => mcp.catalog());
  app.get("/api/v1/mcp/servers", { schema: { tags: ["mcp"] } }, async () => mcp.list());
  app.post("/api/v1/mcp/servers", { schema: { tags: ["mcp"], body: Connect } }, async (req, reply) => {
    reply.code(202);
    return mcp.connect(req.body);
  });
  app.get("/api/v1/mcp/servers/:id", { schema: { tags: ["mcp"], params: Id } }, async (req) => mcp.get(req.params.id));
  app.post("/api/v1/mcp/servers/:id/reconnect", { schema: { tags: ["mcp"], params: Id } }, async (req, reply) => {
    reply.code(202);
    return mcp.reconnect(req.params.id);
  });
  app.post("/api/v1/mcp/servers/:id/bots", { schema: { tags: ["mcp"], params: Id, body: Access } }, async (req) => {
    mcp.setBotAccess(req.params.id, req.body.botId, req.body.enabled);
    return mcp.get(req.params.id);
  });
  app.delete("/api/v1/mcp/servers/:id", { schema: { tags: ["mcp"], params: Id } }, async (req, reply) => {
    await mcp.remove(req.params.id);
    reply.code(204);
    return null;
  });
  app.get("/api/v1/tools", { schema: { tags: ["mcp"] } }, async () => mcp.toolInfos());

  // The browser comes back here after signing in; the state names the server, so no API token is needed.
  const Callback = Type.Object({ state: Type.Optional(Type.String()), code: Type.Optional(Type.String()), error: Type.Optional(Type.String()) });
  app.get("/oauth/mcp/callback", { schema: { hide: true, querystring: Callback } }, async (req, reply) => {
    reply.type("text/html; charset=utf-8");
    try {
      const server = await mcp.completeAuth(req.query.state ?? "", req.query.code, req.query.error);
      const ok = server.status === "connected";
      return callbackPage(
        ok ? `✓ ${server.name} connected` : `${server.name} is not connected`,
        ok ? `Orbis can use ${server.tools.length} tools of ${server.name}. You can close this tab.` : (server.error ?? "Try again from Orbis."),
        ok,
      );
    } catch (err) {
      reply.code(err instanceof HttpError ? err.status : 500);
      return callbackPage("Sign-in not completed", err instanceof Error ? err.message : String(err), false);
    }
  });
}
