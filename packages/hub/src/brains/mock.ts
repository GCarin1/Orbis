// The deterministic mock brain: no network, output derived only from its input.
//
// Directives, one per line of the task:
//   /tool <name> <json input>   call a tool through the gateway
//   /sleep <ms>                  wait (abortable), for queue and timeout tests
//   /fail <message>              end the run as failed
//   /reply <text>                reply with exactly <text>
// Any other text is echoed back in the reply.
import { setTimeout as delay } from "node:timers/promises";
import type { BrainAdapter, BrainEvent, BrainInput, BrainContext } from "./types.js";

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const mockBrain: BrainAdapter = {
  kind: "mock",

  check: () => null,

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    yield { type: "run.started" };
    yield { type: "step.thinking", text: `Reading the task (${input.context.history.length} earlier items in context)` };

    const echo: string[] = [];
    let reply: string | null = null;
    let call = 0;

    for (const rawLine of input.task.split("\n")) {
      const line = rawLine.trim();
      const tool = /^\/tool\s+(\S+)\s*(.*)$/.exec(line);
      if (tool) {
        const name = tool[1]!;
        let args: unknown = {};
        try {
          args = tool[2] ? JSON.parse(tool[2]) : {};
        } catch {
          args = { raw: tool[2] };
        }
        const callId = `mock_${++call}`;
        yield { type: "step.tool_call", callId, tool: name, input: args };
        const result = await ctx.tools.call(name, args, callId);
        yield { type: "step.tool_result", callId, tool: name, output: result.output, isError: result.isError };
        echo.push(`${name} → ${result.isError ? "error: " : ""}${result.output}`);
        continue;
      }
      const sleep = /^\/sleep\s+(\d+)$/.exec(line);
      if (sleep) {
        await delay(Number(sleep[1]), undefined, { signal: ctx.signal });
        continue;
      }
      const fail = /^\/fail\s*(.*)$/.exec(line);
      if (fail) {
        yield { type: "run.failed", error: fail[1] || "mock failure" };
        return;
      }
      const exact = /^\/reply\s+([\s\S]*)$/.exec(line);
      if (exact) {
        reply = exact[1]!;
        continue;
      }
      if (line) echo.push(line);
    }

    const text = reply ?? `[${input.bot.name}] ${echo.join("\n") || "(empty task)"}`;
    yield { type: "step.text", text };
    yield {
      type: "run.usage",
      inputTokens: estimateTokens(input.task + input.context.identity),
      outputTokens: estimateTokens(text),
      cachedTokens: 0,
      costUsd: 0,
      subscription: false,
    };
    yield { type: "run.finished", reply: text };
  },
};
