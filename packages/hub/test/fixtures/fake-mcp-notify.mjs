#!/usr/bin/env node
// A stdio MCP server for tests that speaks on its own: once the client is initialized it sends a warning
// (`notifications/message`), a debug line (left out), pings the client, and — once subscribed to its
// resource — says the resource changed; with NEW_TOOL it then says its tools changed and lists one more.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

// START_LOG: each start writes a line there; EXIT_AFTER: the server stops by itself after that many ms.
if (process.env.START_LOG) appendFileSync(process.env.START_LOG, "start\n");
if (process.env.EXIT_AFTER) setTimeout(() => process.exit(1), Number(process.env.EXIT_AFTER));

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const tools = [{ name: "stock", description: "Read the stock", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }];
let pinged = false;
createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  // The client's answer to our ping.
  if (msg.id === "ping-1") {
    pinged = msg.result !== undefined;
    return;
  }
  if (msg.method === "notifications/initialized") {
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "notifications/message", params: { level: "debug", data: "noise" } });
      send({ jsonrpc: "2.0", method: "notifications/message", params: { level: "warning", logger: "stock", data: "Low stock: 3 units of item 42" } });
      send({ jsonrpc: "2.0", id: "ping-1", method: "ping", params: {} });
    }, 50);
    return;
  }
  if (msg.id === undefined) return;
  switch (msg.method) {
    case "initialize":
      return send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: { listChanged: true }, resources: { subscribe: true } }, serverInfo: { name: "notify", version: "1.0.0" } },
      });
    case "tools/list":
      return send({ jsonrpc: "2.0", id: msg.id, result: { tools } });
    case "resources/list":
      return send({ jsonrpc: "2.0", id: msg.id, result: { resources: [{ uri: "stock://today", name: "Today's stock" }] } });
    case "resources/subscribe":
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      setTimeout(() => {
        send({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: msg.params.uri } });
        if (process.env.NEW_TOOL) {
          tools.push({ name: "restock", description: "Order more", inputSchema: { type: "object" } });
          send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
        }
      }, 80);
      return;
    case "resources/read":
      return send({ jsonrpc: "2.0", id: msg.id, result: { contents: [{ uri: msg.params.uri, text: "item 42: 3 units" }] } });
    case "tools/call":
      return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: pinged ? "pinged" : "not pinged" }] } });
    default:
      return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `no ${msg.method}` } });
  }
});
