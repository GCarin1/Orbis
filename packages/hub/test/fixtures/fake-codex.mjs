#!/usr/bin/env node
// A stand-in for `codex exec --json`, replaying the JSONL shapes of contracts/cli-harnesses.
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
writeFileSync("fake-codex-argv.json", JSON.stringify(argv));
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const last = argv.at(-1) ?? "";
const prompt = last === "-" ? readFileSync(0, "utf8") : last;
writeFileSync("fake-codex-prompt.txt", prompt);
const resumeAt = argv.indexOf("resume");
const threadId = resumeAt >= 0 ? argv[resumeAt + 1] : "thread-abc";

if (resumeAt >= 0 && threadId === "gone-thread") {
  // What Codex 0.158 prints for a thread it no longer has.
  process.stderr.write(`Error: thread/resume: thread/resume failed: no rollout found for thread id ${threadId} (code -32600)\n`);
  process.exit(1);
}
if (prompt.includes("TURN_FAILS")) {
  out({ type: "thread.started", thread_id: threadId });
  out({ type: "turn.failed", error: { message: "usage limit reached for your plan" } });
  process.exit(1);
}
out({ type: "thread.started", thread_id: threadId });
out({ type: "turn.started" });
out({ type: "item.completed", item: { id: "item_0", type: "reasoning", text: "Checking the repository." } });
out({ type: "item.started", item: { id: "item_1", type: "command_execution", command: "bash -lc ls", aggregated_output: "", status: "in_progress" } });
out({ type: "item.completed", item: { id: "item_1", type: "command_execution", command: "bash -lc ls", aggregated_output: "README.md\n", exit_code: 0, status: "completed" } });
out({ type: "item.completed", item: { id: "item_2", type: "mcp_tool_call", server: "orbis", tool: "team_list_bots", status: "completed", result: { content: [{ type: "text", text: "[@ana]" }] } } });
out({ type: "item.completed", item: { id: "item_3", type: "agent_message", text: `${resumeAt >= 0 ? "resumed" : "new"}: ${prompt.split("Task:\n").pop()}` } });
out({ type: "turn.completed", usage: { input_tokens: 300, cached_input_tokens: 100, output_tokens: 30 } });
