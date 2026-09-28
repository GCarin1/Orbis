#!/usr/bin/env node
// A stdio MCP server for tests: one JSON-RPC message per line. `echo` reads
// only; `create_note` writes (no read-only hint). GREETING comes from the
// environment and the first argument is echoed, so tests see both arrive.
import { createInterface } from "node:readline";

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const tools = [
  {
    name: "echo",
    description: "Repeat a text",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    annotations: { readOnlyHint: true },
  },
  { name: "create_note", description: "Create a note", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
];
createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  switch (msg.method) {
    case "initialize":
      return send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1.0.0" } } });
    case "tools/list":
      return send({ jsonrpc: "2.0", id: msg.id, result: { tools } });
    case "tools/call": {
      const { name, arguments: args } = msg.params;
      if (name === "echo") {
        const text = `${process.env.GREETING ?? "no greeting"} | ${process.argv[2] ?? "no arg"} | ${args.text}`;
        return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
      }
      if (name === "create_note") return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `note "${args.title}" created` }] } });
      return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `unknown tool ${name}` }], isError: true } });
    }
    default:
      return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `no ${msg.method}` } });
  }
});
