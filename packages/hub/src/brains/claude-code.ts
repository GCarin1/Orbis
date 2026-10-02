// Claude Code as a subscription brain (contracts/cli-harnesses § claude-code).
import { randomUUID } from "node:crypto";
import { CLAUDE_AUTH_FAILURE } from "@orbis/shared";
import { MAX_ARGV_PROMPT, resolveExecutable, runProcess, describeExit, harnessEnv } from "./process.js";
import { renderSystem, renderTask } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput, McpWiring } from "./types.js";

export interface ClaudeArgsOptions {
  /** The prompt, or null when it is sent on stdin. */
  prompt: string | null;
  system: string;
  model?: string;
  sessionId: string;
  resume: boolean;
  mcp: McpWiring | null;
}

export function claudeArgs(o: ClaudeArgsOptions): string[] {
  const args = ["-p", ...(o.prompt === null ? [] : [o.prompt]), "--output-format", "stream-json", "--verbose", "--append-system-prompt", o.system];
  if (o.model) args.push("--model", o.model);
  if (o.mcp) {
    args.push("--mcp-config", JSON.stringify({ mcpServers: { orbis: { type: "stdio", ...o.mcp.server } } }));
    args.push("--strict-mcp-config");
    if (o.mcp.permissionTool) args.push("--permission-prompt-tool", o.mcp.permissionTool);
  }
  args.push(o.resume ? "--resume" : "--session-id", o.sessionId);
  return args;
}

type Json = Record<string, unknown>;

function contentBlocks(msg: unknown): Json[] {
  const content = (msg as Json | undefined)?.content;
  return Array.isArray(content) ? (content as Json[]) : [];
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : typeof (c as Json).text === "string" ? (c as Json).text : JSON.stringify(c)))
      .join("\n");
  }
  return content === undefined ? "" : JSON.stringify(content);
}

export interface ClaudeStreamState {
  sessionId: string | null;
  toolNames: Map<string, string>;
  finished: boolean;
}

/** Map one stream-json object to normalized events. Unknown types map to nothing. */
export function mapClaudeMessage(obj: Json, state: ClaudeStreamState): BrainEvent[] {
  const out: BrainEvent[] = [];
  if (typeof obj.session_id === "string") state.sessionId = obj.session_id;
  switch (obj.type) {
    case "system":
      if (obj.subtype === "init") out.push({ type: "run.started", sessionId: state.sessionId ?? undefined });
      break;
    case "assistant":
      for (const block of contentBlocks(obj.message)) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          out.push({ type: "step.text", text: block.text });
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          out.push({ type: "step.thinking", text: block.thinking });
        } else if (block.type === "tool_use") {
          const id = String(block.id ?? "");
          const name = String(block.name ?? "tool");
          state.toolNames.set(id, name);
          out.push({ type: "step.tool_call", callId: id, tool: name, input: block.input ?? {} });
        }
      }
      break;
    case "user":
      for (const block of contentBlocks(obj.message)) {
        if (block.type === "tool_result") {
          const id = String(block.tool_use_id ?? "");
          out.push({
            type: "step.tool_result",
            callId: id,
            tool: state.toolNames.get(id) ?? "tool",
            output: toolResultText(block.content),
            isError: block.is_error === true,
          });
        }
      }
      break;
    case "result": {
      const usage = (obj.usage ?? {}) as Json;
      out.push({
        type: "run.usage",
        inputTokens: Number(usage.input_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0),
        outputTokens: Number(usage.output_tokens ?? 0),
        cachedTokens: Number(usage.cache_read_input_tokens ?? 0),
        costUsd: Number(obj.total_cost_usd ?? 0),
        subscription: true,
      });
      state.finished = true;
      if (obj.is_error === true || (typeof obj.subtype === "string" && obj.subtype.startsWith("error"))) {
        out.push({ type: "run.failed", error: withSignInHint(String(obj.result ?? obj.subtype ?? "Claude Code reported an error")) });
      } else {
        out.push({ type: "run.finished", reply: String(obj.result ?? "") });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

const MISSING_SESSION = /no conversation found|session .*not found/i;

/** The error, with the way out when it is about the login: the CLI's own session needs signing in again. */
export function withSignInHint(error: string): string {
  if (!CLAUDE_AUTH_FAILURE.test(error) || /sign in/i.test(error)) return error;
  return `${error} — Claude Code's login needs renewing: sign in again in Orbis (Settings → Brains → Claude Code → Sign in), or run "claude auth login" in a terminal`;
}

export const claudeCodeBrain: BrainAdapter = {
  kind: "claude-code",

  check(bot) {
    const command = bot.brain.command ?? "claude";
    return resolveExecutable(command) ? null : `claude-code brain: executable "${command}" not found on PATH`;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const command = resolveExecutable(input.bot.brain.command ?? "claude")!;
    const stored = ctx.sessions.get();
    const attempts: Array<{ sessionId: string; resume: boolean }> = stored
      ? [{ sessionId: stored, resume: true }, { sessionId: randomUUID(), resume: false }]
      : [{ sessionId: randomUUID(), resume: false }];

    for (const [index, attempt] of attempts.entries()) {
      const state: ClaudeStreamState = { sessionId: null, toolNames: new Map(), finished: false };
      const prompt = renderTask(input, attempt.resume);
      const viaStdin = prompt.length > MAX_ARGV_PROMPT;
      const args = [
        ...(input.bot.brain.args ?? []),
        ...claudeArgs({
          prompt: viaStdin ? null : prompt,
          system: renderSystem(input),
          model: input.bot.brain.model,
          sessionId: attempt.sessionId,
          resume: attempt.resume,
          mcp: ctx.mcp,
        }),
      ];
      let emitted = false;
      let exitMessage: string | null = null;
      let missingSession = false;

      for await (const ev of runProcess({
        command,
        args,
        cwd: ctx.workspaceDir,
        env: harnessEnv(),
        ...(viaStdin ? { stdin: prompt } : {}),
        signal: ctx.signal,
      })) {
        if (ev.type === "line") {
          let obj: Json;
          try {
            obj = JSON.parse(ev.line) as Json;
          } catch {
            continue;
          }
          for (const mapped of mapClaudeMessage(obj, state)) {
            emitted = true;
            yield mapped;
          }
        } else {
          const clean = ev.code === 0 && !ev.timedOut && !ev.aborted && !ev.spawnError;
          if (!clean) {
            exitMessage = describeExit(ev, ctx.timeoutMs);
            missingSession = attempt.resume && MISSING_SESSION.test(ev.stderrTail);
          }
        }
      }

      if (state.finished && state.sessionId) ctx.sessions.set(state.sessionId);
      else if (state.finished) ctx.sessions.set(attempt.sessionId);

      // A stored session that no longer exists: forget it and start a new one.
      if (missingSession && !emitted && index < attempts.length - 1) {
        ctx.sessions.clear();
        continue;
      }
      if (!state.finished) {
        yield { type: "run.failed", error: withSignInHint(exitMessage ?? "Claude Code ended without a result") };
      }
      return;
    }
  },
};
