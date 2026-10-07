// specs/tool-gateway — MCP server updates (change 0061-mcp-server-updates): a server some bot watches stays
// connected and is listened to — a program on its output, an HTTP server on its GET stream — its log
// messages (not debug) and changed resources reach the watching bots in batches, as a run of initiative;
// a ping is answered and a new list of tools is taken; a watched server that stops starts again; quiet
// hours and every bot's switch hold the updates back.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Run } from "@orbis/shared";
import { chat, createBot, FIXTURES, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const notify = path.join(FIXTURES, "fake-mcp-notify.mjs");

async function until<T>(what: () => T | undefined | null | false, ms = 8_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = what();
    if (value) return value;
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const mcpRuns = (botId: string): Run[] => t!.hub.repos.runs.list({ botId, limit: 50 }).filter((r) => r.trigger.type === "initiative" && r.trigger.ref === "mcp");

async function watchingHub() {
  t = await testHub({ mcp: { updateBatchMs: 60, watchRetryMs: [100] }, random: () => 1 });
  await t.api("PUT", "/api/v1/initiative", { quietStart: "00:00", quietEnd: "00:00" });
  return t;
}

describe("a server some bot watches", () => {
  it("reaches the bot with its messages and changed resources, answers its ping and takes its new tools", async () => {
    await watchingHub();
    const ana = await createBot(t!, { name: "Ana", tools: ["*", "mcp.stockroom.*"], initiative: { enabled: true, mcpUpdates: true } });
    t!.hub.mcp.connect({ name: "Stockroom", transport: "stdio", command: process.execPath, args: [notify], env: { NEW_TOOL: "1" } });
    expect(await t!.hub.mcp.ready("stockroom")).toMatchObject({ status: "connected", watchers: [ana.id] });
    expect(t!.hub.mcp.isWatched("stockroom")).toBe(true);

    // The warning and the changed resource (read again) reach Ana, as data; the debug line does not.
    const inputs = await until(() => {
      const text = mcpRuns(ana.id).map((r) => r.input).join("\n");
      return text.includes("Low stock") && text.includes("item 42: 3 units") ? text : null;
    });
    expect(inputs).toMatch(/^\[An update from your MCP servers\]/);
    expect(inputs).toContain('<untrusted-content source="mcp:stockroom">');
    expect(inputs).toMatch(/\[warning\] stock: Low stock: 3 units of item 42/);
    expect(inputs).toContain("resource changed: stock://today\nitem 42: 3 units");
    expect(inputs).toContain("answer exactly [silent]");
    expect(inputs).not.toContain("noise");
    await t!.hub.engine.idle();
    const conv = (await t!.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    const items = (await t!.api("GET", `/api/v1/conversations/${conv.id}/items`)).body as Array<{ runId: string | null }>;
    expect(items.some((i) => mcpRuns(ana.id).some((r) => r.id === i.runId))).toBe(true);

    // Its tools changed: the new one is offered; its ping was answered.
    await until(() => t!.hub.tools.get("mcp.stockroom.restock"));
    const { runs } = await chat(t!, ana.id, "/tool mcp.stockroom.stock {}");
    expect(runs[0]!.steps.find((s) => s.type === "tool_result")?.output).toContain("pinged");
  });

  it("is not kept listening when no bot watches it, and stops being watched when its bot turns updates off", async () => {
    await watchingHub();
    const bia = await createBot(t!, { name: "Bia", tools: ["*", "mcp.stockroom.*"] });
    t!.hub.mcp.connect({ name: "Stockroom", transport: "stdio", command: process.execPath, args: [notify] });
    expect(await t!.hub.mcp.ready("stockroom")).toMatchObject({ watchers: [] });
    expect(t!.hub.mcp.isWatched("stockroom")).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(mcpRuns(bia.id)).toEqual([]);

    await t!.api("PATCH", `/api/v1/bots/${bia.id}`, { initiative: { enabled: true } });
    await until(() => t!.hub.mcp.isWatched("stockroom"));
    await t!.api("PATCH", `/api/v1/bots/${bia.id}`, { initiative: { mcpUpdates: false } });
    await until(() => !t!.hub.mcp.isWatched("stockroom"));
    await t!.hub.engine.idle();
  });

  it("starts again a watched program that stopped", async () => {
    await watchingHub();
    const log = path.join(mkdtempSync(path.join(tmpdir(), "orbis-starts-")), "starts.log");
    await createBot(t!, { name: "Ana", tools: ["*", "mcp.flaky.*"], initiative: { enabled: true } });
    t!.hub.mcp.connect({ name: "Flaky", transport: "stdio", command: process.execPath, args: [notify], env: { START_LOG: log, EXIT_AFTER: "300" } });
    await t!.hub.mcp.ready("flaky");
    await until(() => readFileSync(log, "utf8").split("\n").filter(Boolean).length >= 3, 10_000);
    await t!.hub.engine.idle();
  });
});

describe("an HTTP server that sends updates on its GET stream", () => {
  it("is listened to with its session, its ping is answered and its message reaches the bot", async () => {
    const seen = { gets: [] as Array<string | undefined>, answers: [] as unknown[] };
    const read = (req: IncomingMessage) =>
      new Promise<string>((resolve) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => resolve(body));
      });
    server = createServer(async (req, res) => {
      if (req.method === "GET") {
        seen.gets.push(req.headers["mcp-session-id"] as string | undefined);
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "error", data: "Payment failed for order 7" } })}\n\n`);
        res.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping", params: {} })}\n\n`);
        return; // kept open
      }
      const raw = await read(req);
      if (!raw) {
        res.writeHead(200).end();
        return;
      }
      const msg = JSON.parse(raw);
      if (msg.id === 99) {
        seen.answers.push(msg);
        res.writeHead(202).end();
        return;
      }
      if (msg.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const result =
        msg.method === "initialize"
          ? { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "shop", version: "1" } }
          : msg.method === "tools/list"
            ? { tools: [{ name: "orders", description: "Orders", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }] }
            : {};
      res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "sess-1" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/mcp`;

    await watchingHub();
    const ana = await createBot(t!, { name: "Ana", tools: ["*", "mcp.shop.*"], initiative: { enabled: true } });
    t!.hub.mcp.connect({ name: "Shop", transport: "http", url });
    await t!.hub.mcp.ready("shop");
    const input = await until(() => mcpRuns(ana.id)[0]?.input);
    expect(input).toMatch(/\[error\] Payment failed for order 7/);
    expect(seen.gets[0]).toBe("sess-1");
    await until(() => seen.answers.length > 0);
    expect(seen.answers[0]).toEqual({ jsonrpc: "2.0", id: 99, result: {} });
    await t!.hub.engine.idle();
  });
});

describe("updates held back", () => {
  it("waits for the quiet hours to end, and reaches nobody while every bot's initiative is off", async () => {
    await watchingHub();
    const ana = await createBot(t!, { name: "Ana", initiative: { enabled: true } });
    const bot = t!.hub.botService.get(ana.id);
    const update = { at: new Date().toISOString(), kind: "message" as const, level: "warning", text: "Disk 91% full" };
    // Quiet all day long but a minute.
    const now = new Date();
    const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    await t!.api("PUT", "/api/v1/initiative", { timezone: "UTC", quietStart: hhmm(new Date(now.getTime() - 60_000)), quietEnd: hhmm(new Date(now.getTime() + 120_000)) });
    expect(t!.hub.initiative.mcpUpdates({ id: "disk", name: "Disk" }, [update], [bot])).toEqual([]);
    await t!.api("PUT", "/api/v1/initiative", { quietStart: "00:00", quietEnd: "00:00" });
    const [run] = t!.hub.initiative.tick();
    expect(run).toMatchObject({ trigger: { type: "initiative", ref: "mcp" } });
    expect(run!.input).toContain("Disk 91% full");
    await t!.hub.engine.idle();

    await t!.api("PUT", "/api/v1/initiative", { enabled: false });
    expect(t!.hub.initiative.mcpUpdates({ id: "disk", name: "Disk" }, [update], [bot])).toEqual([]);
    await t!.api("PUT", "/api/v1/initiative", { enabled: true });
    expect(t!.hub.initiative.tick()).toEqual([]);
  });
});
