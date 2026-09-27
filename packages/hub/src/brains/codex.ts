// OpenAI Codex CLI as a subscription brain (contracts/cli-harnesses § codex).
import { describeExit, harnessEnv, resolveExecutable, runProcess } from "./process.js";
import { renderFullPrompt, renderTask } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput, McpWiring } from "./types.js";

/** TOML inline value for `-c key=value` overrides (JSON strings and arrays are valid TOML). */
const toml = (value: string | string[]) => JSON.stringify(value);

export function codexMcpOverrides(mcp: McpWiring | null): string[] {
  if (!mcp) return [];
  const env = Object.entries(mcp.server.env)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(",");
  return [
    "-c",
    `mcp_servers.orbis.command=${toml(mcp.server.command)}`,
    "-c",
    `mcp_servers.orbis.args=${toml(mcp.server.args)}`,
    "-c",
    `mcp_servers.orbis.env={${env}}`,
  ];
}

export function codexArgs(o: { prompt: string; workspace: string; model?: string; threadId: string | null; mcp: McpWiring | null }): string[] {
  const options = [
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--cd",
    o.workspace,
    ...(o.model ? ["-m", o.model] : []),
    ...codexMcpOverrides(o.mcp),
  ];
  return o.threadId ? ["exec", ...options, "resume", o.threadId, o.prompt] : ["exec", ...options, o.prompt];
}

type Json = Record<string, any>;

export interface CodexState {
  threadId: string | null;
  started: Set<string>;
  lastMessage: string | null;
  finished: boolean;
  failed: string | null;
}

/** Map one Codex JSONL event (current `item.*` shape, or the older `msg` shape) to normalized events. */
export function mapCodexEvent(obj: Json, state: CodexState): BrainEvent[] {
  const out: BrainEvent[] = [];
  if (obj.msg && typeof obj.msg === "object") {
    const msg = obj.msg as Json;
    switch (msg.type) {
      case "session_configured":
        if (typeof msg.session_id === "string") state.threadId = msg.session_id;
        out.push({ type: "run.started", sessionId: state.threadId ?? undefined });
        break;
      case "agent_message":
        state.lastMessage = String(msg.message ?? "");
        out.push({ type: "step.text", text: state.lastMessage });
        break;
      case "agent_reasoning":
        out.push({ type: "step.thinking", text: String(msg.text ?? "") });
        break;
      case "exec_command_begin":
        out.push({ type: "step.tool_call", callId: String(msg.call_id ?? ""), tool: "shell", input: { command: msg.command } });
        break;
      case "exec_command_end":
        out.push({ type: "step.tool_result", callId: String(msg.call_id ?? ""), tool: "shell", output: String(msg.aggregated_output ?? msg.stdout ?? ""), isError: Number(msg.exit_code ?? 0) !== 0 });
        break;
      case "token_count":
        if (msg.info?.total_token_usage) {
          const u = msg.info.total_token_usage;
          out.push({ type: "run.usage", inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0), cachedTokens: Number(u.cached_input_tokens ?? 0), costUsd: 0, subscription: true });
        }
        break;
      case "task_complete":
        state.finished = true;
        if (typeof msg.last_agent_message === "string") state.lastMessage = msg.last_agent_message;
        break;
      case "error":
        state.failed = String(msg.message ?? "Codex reported an error");
        break;
    }
    return out;
  }

  switch (obj.type) {
    case "thread.started":
      if (typeof obj.thread_id === "string") state.threadId = obj.thread_id;
      out.push({ type: "run.started", sessionId: state.threadId ?? undefined });
      break;
    case "item.started": {
      const item = obj.item as Json | undefined;
      if (!item) break;
      if (item.type === "command_execution") {
        state.started.add(String(item.id));
        out.push({ type: "step.tool_call", callId: String(item.id), tool: "shell", input: { command: item.command } });
      } else if (item.type === "mcp_tool_call") {
        state.started.add(String(item.id));
        out.push({ type: "step.tool_call", callId: String(item.id), tool: `${item.server}.${item.tool}`, input: item.arguments ?? {} });
      }
      break;
    }
    case "item.completed": {
      const item = obj.item as Json | undefined;
      if (!item) break;
      const id = String(item.id ?? "");
      switch (item.type) {
        case "agent_message":
          state.lastMessage = String(item.text ?? "");
          out.push({ type: "step.text", text: state.lastMessage });
          break;
        case "reasoning":
          if (item.text) out.push({ type: "step.thinking", text: String(item.text) });
          break;
        case "command_execution":
          if (!state.started.has(id)) out.push({ type: "step.tool_call", callId: id, tool: "shell", input: { command: item.command } });
          out.push({ type: "step.tool_result", callId: id, tool: "shell", output: String(item.aggregated_output ?? ""), isError: item.status === "failed" || Number(item.exit_code ?? 0) !== 0 });
          break;
        case "mcp_tool_call": {
          const tool = `${item.server}.${item.tool}`;
          if (!state.started.has(id)) out.push({ type: "step.tool_call", callId: id, tool, input: item.arguments ?? {} });
          const result = item.result?.content ? (item.result.content as Json[]).map((c) => c.text ?? JSON.stringify(c)).join("\n") : String(item.error?.message ?? "");
          out.push({ type: "step.tool_result", callId: id, tool, output: result, isError: item.status === "failed" });
          break;
        }
        case "file_change": {
          const changes = (item.changes as Json[] | undefined) ?? [];
          out.push({ type: "step.tool_result", callId: id, tool: "file_change", output: changes.map((c) => `${c.kind} ${c.path}`).join("\n"), isError: item.status === "failed" });
          break;
        }
        case "error":
          state.failed = String(item.message ?? "Codex reported an error");
          break;
      }
      break;
    }
    case "turn.completed": {
      const u = (obj.usage ?? {}) as Json;
      out.push({ type: "run.usage", inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0), cachedTokens: Number(u.cached_input_tokens ?? 0), costUsd: 0, subscription: true });
      state.finished = true;
      break;
    }
    case "turn.failed":
      state.failed = String(obj.error?.message ?? "Codex turn failed");
      break;
    case "error":
      state.failed = String(obj.message ?? "Codex reported an error");
      break;
  }
  return out;
}

export const codexBrain: BrainAdapter = {
  kind: "codex",

  check(bot) {
    const command = bot.brain.command ?? "codex";
    return resolveExecutable(command) ? null : `codex brain: executable "${command}" not found on PATH`;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const command = resolveExecutable(input.bot.brain.command ?? "codex")!;
    const threadId = ctx.sessions.get();
    const prompt = threadId ? renderTask(input) : renderFullPrompt(input);
    const state: CodexState = { threadId: null, started: new Set(), lastMessage: null, finished: false, failed: null };
    let exitMessage: string | null = null;

    for await (const ev of runProcess({
      command,
      args: [...(input.bot.brain.args ?? []), ...codexArgs({ prompt, workspace: ctx.workspaceDir, model: input.bot.brain.model, threadId, mcp: ctx.mcp })],
      cwd: ctx.workspaceDir,
      env: harnessEnv(),
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
    })) {
      if (ev.type === "line") {
        let obj: Json;
        try {
          obj = JSON.parse(ev.line) as Json;
        } catch {
          continue;
        }
        yield* mapCodexEvent(obj, state);
      } else if (ev.code !== 0 || ev.timedOut || ev.aborted || ev.spawnError) {
        exitMessage = describeExit(ev, ctx.timeoutMs);
      }
    }

    if (state.threadId) ctx.sessions.set(state.threadId);
    if (state.failed) {
      yield { type: "run.failed", error: state.failed };
    } else if (exitMessage && !state.finished) {
      yield { type: "run.failed", error: exitMessage };
    } else if (!state.lastMessage) {
      yield { type: "run.failed", error: exitMessage ?? "Codex ended without a reply" };
    } else {
      yield { type: "run.finished", reply: state.lastMessage };
    }
  },
};
