#!/usr/bin/env node
// A stand-in for `claude -p --output-format stream-json`, replaying the shapes
// of contracts/cli-harnesses. It records its argv and environment in the
// working directory so tests can assert what the adapter passed.
import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";

const argv = process.argv.slice(2);
writeFileSync("fake-claude-argv.json", JSON.stringify(argv));
writeFileSync("fake-claude-env.json", JSON.stringify(process.env));
// The skills Claude Code would load from its working directory.
const skills = existsSync(".claude/skills")
  ? readdirSync(".claude/skills", { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(`.claude/skills/${d.name}/SKILL.md`))
      .map((d) => ({ name: d.name, content: readFileSync(`.claude/skills/${d.name}/SKILL.md`, "utf8") }))
  : [];
writeFileSync("fake-claude-skills.json", JSON.stringify(skills));

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const promptArg = flag("-p");
// A long prompt comes on stdin, with no value after -p.
const prompt = promptArg === undefined || promptArg.startsWith("--") ? readFileSync(0, "utf8") : promptArg;
writeFileSync("fake-claude-prompt.txt", prompt);
const resume = flag("--resume");
const sessionId = resume ?? flag("--session-id");
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

if (prompt.includes("ASK_BASH")) {
  // Ask the Orbis permission tool about Bash through the MCP bridge, as Claude Code does, then report the answer.
  const { spawn } = await import("node:child_process");
  const { createInterface } = await import("node:readline");
  const server = JSON.parse(flag("--mcp-config")).mcpServers.orbis;
  const child = spawn(server.command, server.args, { env: { ...process.env, ...server.env }, stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-claude", version: "1" } },
  });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "approval_prompt", arguments: { tool_name: "Bash", input: { command: "ls" } } } });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "team_list_bots", arguments: {} } });
  const order = [];
  let decision = null;
  for await (const line of lines) {
    const msg = JSON.parse(line);
    order.push(msg.id);
    if (msg.id === 2) {
      decision = JSON.parse(msg.result.content[0].text).behavior;
      break;
    }
  }
  child.kill();
  const reply = `bash ${decision}; answers in order ${order.join(",")}`;
  out({ type: "system", subtype: "init", session_id: sessionId, tools: ["Bash"], mcp_servers: [] });
  out({ type: "result", subtype: "success", is_error: false, result: reply, session_id: sessionId, usage: {} });
  process.exit(0);
}
if (prompt.includes("EXIT_WITH_ERROR")) {
  process.stderr.write("fatal: the model is unavailable\n");
  process.exit(3);
}
if (prompt.includes("HANG")) {
  setInterval(() => {}, 1000);
} else {
  if (resume && !existsSync(`session-${resume}`)) {
    process.stderr.write(`No conversation found with session ID: ${resume}\n`);
    process.exit(1);
  }
  writeFileSync(`session-${sessionId}`, "");
  const turns = existsSync("turns.txt") ? Number(readFileSync("turns.txt", "utf8")) : 0;
  writeFileSync("turns.txt", String(turns + 1));

  out({ type: "active_goal", value: null, session_id: sessionId });
  out({ type: "system", subtype: "init", session_id: sessionId, tools: ["Bash"], mcp_servers: [] });
  out({
    type: "assistant",
    session_id: sessionId,
    message: {
      content: [
        { type: "thinking", thinking: "Let me look at the workspace." },
        { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
      ],
    },
  });
  out({
    type: "user",
    session_id: sessionId,
    message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "README.md" }] }] },
  });
  const reply = `turn ${turns + 1}: ${prompt.split("Task:\n").pop()}`;
  out({ type: "assistant", session_id: sessionId, message: { content: [{ type: "text", text: reply }] } });
  out({
    type: "result",
    subtype: "success",
    is_error: false,
    result: reply,
    session_id: sessionId,
    total_cost_usd: 0.0123,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 5 },
  });
}
