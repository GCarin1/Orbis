// specs/tool-gateway — acceptance criterion 5 (the `orbis mcp` stdio bridge).
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis mcp", () => {
  it("forwards tools/list and tools/call to the hub and prints the responses on stdout (criterion 5)", async () => {
    hub = await startTestHub();
    const bot = hub.hub.botService.create({ name: "Ana", brain: { kind: "mock" }, tools: ["team.list_bots"] });
    const conv = hub.hub.conversationService.directFor(bot.id);
    const run = hub.hub.engine.enqueue({ botId: bot.id, conversationId: conv.id, trigger: { type: "api", ref: null }, input: "/sleep 5000" });
    const session = hub.hub.gateway.open(hub.hub.repos.runs.get(run.id)!, bot, new AbortController().signal);
    const runToken = session.mcp!.server.env.ORBIS_RUN_TOKEN!;

    const stdin = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "team_list_bots", arguments: {} } },
    ]
      .map((m) => JSON.stringify(m))
      .join("\n") + "\n";

    const res = await runCli(["mcp"], { HOME: hub.env.HOME, ORBIS_URL: hub.url, ORBIS_RUN_TOKEN: runToken }, stdin);
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
    const lines = res.stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id)).toEqual([1, 2, 3]); // the notification gets no answer
    expect(lines[0].result.serverInfo.name).toBe("orbis");
    expect(lines[1].result.tools.map((t: { name: string }) => t.name)).toEqual(["team_list_bots"]);
    expect(JSON.parse(lines[2].result.content[0].text)).toEqual([expect.objectContaining({ handle: "ana" })]);

    session.close();
    const revoked = await runCli(["mcp"], { HOME: hub.env.HOME, ORBIS_URL: hub.url, ORBIS_RUN_TOKEN: runToken }, JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) + "\n");
    expect(JSON.parse(revoked.stdout.trim()).error.message).toMatch(/revoked run token/);
    hub.hub.engine.cancel(run.id);
  });

  it("needs ORBIS_RUN_TOKEN", async () => {
    hub = await startTestHub();
    const res = await runCli(["mcp"], { HOME: hub.env.HOME, ORBIS_URL: hub.url }, "");
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/ORBIS_RUN_TOKEN/);
  });
});
