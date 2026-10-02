// Audit cycle 4 (change 0026-audit-cycle-4-mcp-and-apis): external MCP servers
// and the OpenAI-compatible API, kept as regressions.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Run } from "@orbis/shared";
import { toWireName, WIRE_NAME_MAX } from "../src/tools/registry.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const json = (res: ServerResponse, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(200, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

/** An HTTP MCP server whose session can be ended, as a server restart does. */
async function sessionServer(toolName: string) {
  const seen = { initialize: 0, sessions: [] as Array<string | undefined> };
  let live = "sess-1";
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    if (req.method !== "POST") {
      res.writeHead(405);
      return res.end();
    }
    const msg = JSON.parse(raw);
    if (msg.id === undefined) {
      res.writeHead(202);
      return res.end();
    }
    if (msg.method === "initialize") {
      seen.initialize++;
      live = `sess-${seen.initialize}`;
      return json(
        res,
        { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "kb", version: "1" } } },
        { "mcp-session-id": live },
      );
    }
    seen.sessions.push(req.headers["mcp-session-id"] as string | undefined);
    if (req.headers["mcp-session-id"] !== live) {
      res.writeHead(404);
      return res.end();
    }
    if (msg.method === "tools/list")
      return json(res, {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: [{ name: toolName, description: "Search the knowledge base", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }] },
      });
    return json(res, { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `found: ${msg.params.arguments.q}` }] } });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, seen, endSession: () => void (live = "ended") };
}

describe("tool names on the wire", () => {
  it("keeps every wire name within what model APIs and Claude Code accept, unique, and mapped back", () => {
    const long = "mcp.company-knowledge-base-of-the-whole-team.search_all_documents_of_every_department";
    const wire = toWireName(long);
    expect(wire.length).toBeLessThanOrEqual(WIRE_NAME_MAX);
    expect(wire).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(toWireName(`${long}_2`)).not.toBe(wire);
    expect(toWireName("team.handoff")).toBe("team_handoff");
  });

  it("lets a bot use a tool of a server with a long name, and answers again after the server ended its session", async () => {
    const tool = "search_all_documents_of_every_department_in_the_company";
    const fake = await sessionServer(tool);
    t = await testHub();
    const created = t.hub.mcp.connect({ name: "Company knowledge base of the whole team", transport: "http", url: fake.url });
    const ready = await t.hub.mcp.ready(created.id);
    expect(ready.status).toBe("connected");
    const name = ready.tools[0]!.name;
    const ana = await createBot(t, { name: "Ana", tools: ["*", `mcp.${created.id}.*`] });
    // The tool resolves from its short wire name, as a brain sends it.
    expect(t.hub.tools.resolve(toWireName(name))?.name).toBe(name);
    const first = await chat(t, ana.id, `/tool ${toWireName(name)} ${JSON.stringify({ q: "férias" })}`);
    expect((first.runs[0] as Run).steps.find((s) => s.type === "tool_result")).toMatchObject({
      isError: false,
      output: expect.stringContaining("found: férias"),
    });
    fake.endSession();
    const second = await chat(t, ana.id, `/tool ${name} ${JSON.stringify({ q: "reembolso" })}`);
    expect((second.runs[0] as Run).steps.find((s) => s.type === "tool_result")).toMatchObject({
      isError: false,
      output: expect.stringContaining("found: reembolso"),
    });
    expect(fake.seen.initialize).toBe(2);
  });
});

describe("the OpenAI-compatible API", () => {
  it("answers 400, not a crash, when the message starts no run", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", skills: [] });
    await t.api("POST", "/api/v1/skills", { content: "---\nname: secret-ops\ndescription: Not for Ana\n---\nSteps." });
    const res = await t.api("POST", "/v1/chat/completions", { model: `orbis:${ana.handle}`, messages: [{ role: "user", content: "/secret-ops now" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "no_run" });
  });
});
