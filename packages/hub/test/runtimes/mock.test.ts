// specs/agent-runtimes — acceptance criterion 1.
import { describe, expect, it } from "vitest";
import { mockBrain } from "../../src/brains/mock.js";
import type { BrainContext, BrainEvent, BrainInput } from "../../src/brains/types.js";
import type { Bot } from "@orbis/shared";

const bot = { id: "bot_1", name: "Ana", handle: "ana", brain: { kind: "mock" } } as Bot;

function input(task: string): BrainInput {
  return { runId: "run_1", bot, conversationId: null, task, skill: null, context: { identity: "", memories: [], history: [] } };
}

function ctx(): BrainContext {
  return {
    signal: new AbortController().signal,
    workspaceDir: "/tmp",
    timeoutMs: 1000,
    sessions: { get: () => null, set: () => undefined, clear: () => undefined },
    tools: {
      list: () => [],
      call: async (name, args) => ({ output: `${name}:${JSON.stringify(args)}`, isError: false }),
    },
    config: {} as BrainContext["config"],
    mcp: null,
    secret: () => null,
  };
}

async function collect(task: string): Promise<BrainEvent[]> {
  const out: BrainEvent[] = [];
  for await (const e of mockBrain.run(input(task), ctx())) out.push(e);
  return out;
}

describe("mock brain", () => {
  it("emits run.started, step.text and run.finished in order for a plain message (criterion 1)", async () => {
    const events = await collect("hello there");
    const types = events.map((e) => e.type).filter((t) => t !== "step.thinking" && t !== "run.usage");
    expect(types).toEqual(["run.started", "step.text", "run.finished"]);
    expect(events.at(-1)).toEqual({ type: "run.finished", reply: "[Ana] hello there" });
  });

  it("emits a step.tool_call / step.tool_result pair when the message asks for a tool (criterion 1)", async () => {
    const events = await collect('/tool memory.search {"query":"deploy"}');
    const call = events.find((e) => e.type === "step.tool_call");
    const result = events.find((e) => e.type === "step.tool_result");
    expect(call).toMatchObject({ tool: "memory.search", input: { query: "deploy" } });
    expect(result).toMatchObject({ tool: "memory.search", output: 'memory.search:{"query":"deploy"}', isError: false });
    expect(events.indexOf(call!)).toBeLessThan(events.indexOf(result!));
  });

  it("is deterministic and supports /reply and /fail", async () => {
    expect(await collect("same")).toEqual(await collect("same"));
    expect((await collect("/reply exactly this")).at(-1)).toEqual({ type: "run.finished", reply: "exactly this" });
    expect((await collect("/fail nope")).at(-1)).toEqual({ type: "run.failed", error: "nope" });
  });
});
