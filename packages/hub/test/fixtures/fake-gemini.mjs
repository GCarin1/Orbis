#!/usr/bin/env node
// A stand-in for `gemini -p --output-format stream-json`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
writeFileSync("fake-gemini-argv.json", JSON.stringify(argv));
if (existsSync(".gemini/settings.json")) writeFileSync("fake-gemini-settings.json", readFileSync(".gemini/settings.json"));
const prompt = argv[argv.indexOf("-p") + 1] ?? "";
const task = prompt.split("Task:\n").pop();
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

if (prompt.includes("JSON_MODE")) {
  process.stdout.write(JSON.stringify({ response: `json reply: ${task}`, stats: {} }, null, 2) + "\n");
  process.exit(0);
}
out({ type: "init", session_id: "g-1", model: "gemini-2.5-pro" });
out({ type: "message", role: "user", content: task });
out({ type: "message", role: "assistant", content: "Looking", delta: true });
out({ type: "tool_use", tool_name: "orbis__team_list_bots", tool_id: "t1", parameters: {} });
out({ type: "tool_result", tool_id: "t1", status: "success", output: "[@ana]" });
out({ type: "message", role: "assistant", content: "gemini says: ", delta: true });
out({ type: "message", role: "assistant", content: task, delta: true });
out({ type: "result", status: "success", stats: { total_tokens: 70, input_tokens: 50, output_tokens: 20, duration_ms: 5, tool_calls: 1 } });
