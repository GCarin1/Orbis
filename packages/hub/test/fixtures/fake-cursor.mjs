#!/usr/bin/env node
// A stand-in for Cursor's `agent -p --output-format stream-json <prompt>`, with
// the event shapes of Cursor's CLI output-format reference.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
writeFileSync("fake-cursor-argv.json", JSON.stringify(argv));
for (const name of ["mcp.json", "cli.json"]) {
  if (existsSync(`.cursor/${name}`)) writeFileSync(`fake-cursor-${name}`, readFileSync(`.cursor/${name}`));
}
const prompt = argv[argv.length - 1] ?? "";
const task = prompt.split("Task:\n").pop();
const resume = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : null;
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

if (resume === "gone-chat") {
  process.stderr.write("Error: chat gone-chat not found\n");
  process.exit(1);
}
if (task.includes("NOT_LOGGED_IN")) {
  process.stderr.write("Authentication required. Run `agent login`.\n");
  process.exit(1);
}
const session = resume ?? "chat-1";
out({ type: "system", subtype: "init", apiKeySource: "login", cwd: process.cwd(), session_id: session, model: "Auto", permissionMode: "default" });
out({ type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] }, session_id: session });
if (task.includes("17 × 23")) {
  out({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "391" }] }, session_id: session });
  out({ type: "result", subtype: "success", duration_ms: 5, duration_api_ms: 5, is_error: false, result: "391", session_id: session });
  process.exit(0);
}
out({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Reading the file" }] }, session_id: session });
out({ type: "tool_call", subtype: "started", call_id: "c1", tool_call: { readToolCall: { args: { path: "README.md" } } }, session_id: session });
out({
  type: "tool_call",
  subtype: "completed",
  call_id: "c1",
  tool_call: { readToolCall: { args: { path: "README.md" }, result: { success: { content: "# Readme", isEmpty: false, totalLines: 1 } } } },
  session_id: session,
});
out({ type: "tool_call", subtype: "started", call_id: "c2", tool_call: { function: { name: "orbis__team_list_bots", arguments: "{}" } }, session_id: session });
out({ type: "tool_call", subtype: "completed", call_id: "c2", tool_call: { function: { name: "orbis__team_list_bots", arguments: "{}", result: { error: { errorMessage: "denied" } } } }, session_id: session });
const reply = `${resume ? "resumed" : "cursor says"}: ${task}`;
out({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: reply }] }, session_id: session });
if (task.includes("TURN_FAILS")) {
  out({ type: "result", subtype: "error", is_error: true, result: "you hit your usage limit", session_id: session });
  process.exit(0);
}
out({ type: "result", subtype: "success", duration_ms: 5, duration_api_ms: 5, is_error: false, result: reply, session_id: session });
