// specs/tool-gateway — acceptance criterion 4 (MCP over HTTP with run tokens).
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import type { Bot, Run } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function rpc(t: TestHub, token: string | null, body: unknown) {
  const res = await t.hub.app.inject({
    method: "POST",
    url: "/mcp",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as object,
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

/** Open a tool session the way the engine does for a run, and return its token. */
function openSession(t: TestHub, bot: Bot) {
  const conv = t.hub.conversationService.directFor(bot.id);
  const run = t.hub.engine.enqueue({ botId: bot.id, conversationId: conv.id, trigger: { type: "api", ref: null }, input: "/sleep 5000" });
  const controller = new AbortController();
  const session = t.hub.gateway.open(t.hub.repos.runs.get(run.id) as Run, bot, controller.signal);
  const token = session.mcp!.server.env.ORBIS_RUN_TOKEN!;
  return { session, token, run, conv, controller };
}

describe("MCP endpoint", () => {
  it("answers initialize, tools/list and tools/call for a valid run token and 401 once revoked (criterion 4)", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = t.hub.botService.get((await createBot(t, { tools: ["team.*", "conversation.post"] })).id);
    const { session, token, run, conv } = openSession(t, bot);

    const init = await rpc(t, token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect(init.status).toBe(200);
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "orbis" } });

    const note = await rpc(t, token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);

    const list = await rpc(t, token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.body.result.tools.map((x: { name: string }) => x.name).sort()).toEqual(["conversation_post", "team_list_bots"]);
    expect(list.body.result.tools[0].inputSchema).toMatchObject({ type: "object" });

    const call = await rpc(t, token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "conversation_post", arguments: { text: "hello over MCP" } } });
    expect(call.body.result).toMatchObject({ isError: false, content: [{ type: "text" }] });
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.some((i: { text: string; runId: string }) => i.text === "hello over MCP" && i.runId === run.id)).toBe(true);

    const unknown = await rpc(t, token, { jsonrpc: "2.0", id: 4, method: "resources/list" });
    expect(unknown.body.error.code).toBe(-32601);

    session.close();
    const revoked = await rpc(t, token, { jsonrpc: "2.0", id: 5, method: "tools/list" });
    expect(revoked.status).toBe(401);
    expect((await rpc(t, null, { jsonrpc: "2.0", id: 6, method: "tools/list" })).status).toBe(401);
    expect((await rpc(t, "made-up", { jsonrpc: "2.0", id: 7, method: "tools/list" })).status).toBe(401);
    t.hub.engine.cancel(run.id);
  });

  it("answers 405 to GET /mcp and wires CLI brains with a run-scoped token only", async () => {
    t = await testHub();
    const url = await t.hub.listen();
    const res = await t.hub.app.inject({ method: "GET", url: "/mcp" });
    expect(res.statusCode).toBe(405);

    const bot = t.hub.botService.get((await createBot(t, { brain: { kind: "claude-code" } })).id);
    const { session, run } = openSession(t, bot);
    expect(session.mcp!.server.command).toBe(process.execPath);
    expect(session.mcp!.server.args[0]).toMatch(/mcp-bridge\.js$/);
    expect(Object.keys(session.mcp!.server.env).sort()).toEqual(["ORBIS_RUN_TOKEN", "ORBIS_URL"]);
    expect(session.mcp!.server.env.ORBIS_URL).toBe(url);
    expect(session.mcp!.server.env.ORBIS_RUN_TOKEN).not.toBe(t.hub.config.token);
    expect(session.mcp!.permissionTool).toBe("mcp__orbis__approval_prompt");
    session.close();
    t.hub.engine.cancel(run.id);
  });

  it("serves a real MCP client through the hub's bridge script as a subprocess", async () => {
    t = await testHub();
    await t.hub.listen();
    const bot = t.hub.botService.get((await createBot(t, { tools: ["team.*"] })).id);
    const { session, run } = openSession(t, bot);
    const { command, args, env } = session.mcp!.server;
    const child = spawn(command, args, { env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["pipe", "pipe", "pipe"] });
    const lines: string[] = [];
    child.stdout.setEncoding("utf8").on("data", (d: string) => lines.push(...d.trim().split("\n")));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    child.stdin.end();
    const code = await new Promise<number | null>((r) => child.on("close", r));
    expect(code).toBe(0);
    const responses = lines.map((l) => JSON.parse(l));
    expect(responses[0].result.serverInfo.name).toBe("orbis");
    expect(responses[1].result.tools.map((x: { name: string }) => x.name)).toEqual(["team_list_bots"]);
    session.close();
    t.hub.engine.cancel(run.id);
  });
});
