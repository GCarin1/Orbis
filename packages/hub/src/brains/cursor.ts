// Cursor's agent CLI as a subscription brain (contracts/cli-harnesses § cursor).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findExecutable } from "./health.js";
import { describeExit, harnessEnv, resolveExecutable, runProcess } from "./process.js";
import { renderFullPrompt } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput, McpWiring } from "./types.js";

type Json = Record<string, any>;

/** Cursor's installer names the CLI `agent`; older installs call it `cursor-agent`. */
export const CURSOR_EXECUTABLES = ["cursor-agent", "agent"];

/** The executable a cursor bot runs: its own command, else the first Cursor CLI on PATH. */
export function cursorExecutable(command: string | undefined, envPath = process.env.PATH ?? ""): string | null {
  if (command) return resolveExecutable(command, envPath);
  return findExecutable(CURSOR_EXECUTABLES, envPath)?.path ?? null;
}

export function cursorArgs(o: { prompt: string; model?: string; workspace: string; resume: string | null; mcp: boolean }): string[] {
  const args = ["-p", "--output-format", "stream-json", "--trust", "--workspace", o.workspace];
  if (o.mcp) args.push("--approve-mcps");
  if (o.model) args.push("--model", o.model);
  if (o.resume) args.push("--resume", o.resume);
  // The prompt goes last: it is the CLI's positional argument.
  args.push(o.prompt);
  return args;
}

/** Write a JSON file under `<workspace>/.cursor`, returning a function that restores it. */
function patchJson(file: string, patch: (current: Json) => Json): () => void {
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;
  let current: Json = {};
  try {
    current = previous ? (JSON.parse(previous) as Json) : {};
  } catch {
    current = {};
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(patch(current), null, 2), { mode: 0o600 });
  return () => {
    if (previous === null) rmSync(file, { force: true });
    else writeFileSync(file, previous);
  };
}

/**
 * Put the Orbis MCP server into `<workspace>/.cursor/mcp.json` and allow its
 * tools in `<workspace>/.cursor/cli.json`, keeping whatever else the files
 * hold; returns a function that restores both. Orbis policy still decides
 * every Orbis tool call; Cursor's own shell and write tools keep Cursor's rules.
 */
export function installCursorConfig(workspace: string, mcp: McpWiring | null): () => void {
  if (!mcp) return () => undefined;
  const dir = path.join(workspace, ".cursor");
  const restoreMcp = patchJson(path.join(dir, "mcp.json"), (current) => ({
    ...current,
    mcpServers: { ...(current.mcpServers ?? {}), orbis: { type: "stdio", command: mcp.server.command, args: mcp.server.args, env: mcp.server.env } },
  }));
  const restoreCli = patchJson(path.join(dir, "cli.json"), (current) => {
    const permissions = (current.permissions ?? {}) as Json;
    const allow: string[] = Array.isArray(permissions.allow) ? permissions.allow : [];
    return { ...current, permissions: { ...permissions, allow: allow.includes("Mcp(orbis:*)") ? allow : [...allow, "Mcp(orbis:*)"] } };
  });
  return () => {
    restoreCli();
    restoreMcp();
  };
}

/** A tool call's name, input and (when completed) result, from Cursor's `tool_call` object. */
function toolCallParts(raw: unknown): { name: string; input: unknown; result: Json | undefined } {
  const [key, value] = Object.entries((raw ?? {}) as Json)[0] ?? ["tool", {}];
  const call = (value ?? {}) as Json;
  if (key === "function") {
    let input: unknown = call.arguments ?? {};
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        /* keep the raw text */
      }
    }
    return { name: String(call.name ?? "tool"), input, result: call.result as Json | undefined };
  }
  const args = (call.args ?? {}) as Json;
  // MCP calls carry the tool's own name inside their arguments.
  const mcpName = /^mcp/i.test(key) ? (args.toolName ?? args.name) : undefined;
  return { name: typeof mcpName === "string" ? mcpName : key.replace(/ToolCall$/, "") || "tool", input: args, result: call.result as Json | undefined };
}

function toolOutput(result: Json | undefined): { output: string; isError: boolean } {
  if (result === undefined || result === null) return { output: "", isError: false };
  if (!("success" in result)) {
    const error = result.error ?? result.rejected ?? result;
    const text = typeof error === "string" ? error : (error?.errorMessage ?? error?.message ?? JSON.stringify(error));
    return { output: String(text), isError: true };
  }
  const success = result.success;
  if (typeof success === "string") return { output: success, isError: false };
  const content = success?.content ?? success?.stdout ?? success?.output;
  return { output: typeof content === "string" ? content : JSON.stringify(success ?? ""), isError: false };
}

export interface CursorState {
  sessionId: string | null;
  finished: boolean;
  failed: string | null;
}

/** Map one stream-json object to normalized events. Unknown types map to nothing. */
export function mapCursorEvent(obj: Json, state: CursorState): BrainEvent[] {
  const out: BrainEvent[] = [];
  if (typeof obj.session_id === "string") state.sessionId = obj.session_id;
  switch (obj.type) {
    case "system":
      if (obj.subtype === "init") out.push({ type: "run.started", sessionId: state.sessionId ?? undefined });
      break;
    case "assistant": {
      const content = Array.isArray(obj.message?.content) ? (obj.message.content as Json[]) : [];
      const text = content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("");
      if (text.trim()) out.push({ type: "step.text", text });
      break;
    }
    case "tool_call": {
      const callId = String(obj.call_id ?? "");
      const { name, input, result } = toolCallParts(obj.tool_call);
      if (obj.subtype === "started") out.push({ type: "step.tool_call", callId, tool: name, input });
      else if (obj.subtype === "completed") out.push({ type: "step.tool_result", callId, tool: name, ...toolOutput(result) });
      break;
    }
    case "result":
      // Cursor reports no token counts; the run still counts as a subscription run.
      out.push({ type: "run.usage", inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscription: true });
      if (obj.is_error === true || (typeof obj.subtype === "string" && obj.subtype !== "success")) {
        state.failed = String(obj.result || obj.subtype || "Cursor reported an error");
      } else {
        state.finished = true;
        out.push({ type: "run.finished", reply: String(obj.result ?? "") });
      }
      break;
    default:
      break;
  }
  return out;
}

export const cursorBrain: BrainAdapter = {
  kind: "cursor",

  check(bot) {
    if (cursorExecutable(bot.brain.command)) return null;
    return bot.brain.command
      ? `cursor brain: executable "${bot.brain.command}" not found on PATH`
      : `cursor brain: the Cursor CLI ("${CURSOR_EXECUTABLES.join('" or "')}") is not on PATH`;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const command = cursorExecutable(input.bot.brain.command)!;
    const stored = ctx.sessions.get();
    const attempts: Array<string | null> = stored ? [stored, null] : [null];
    const restore = installCursorConfig(ctx.workspaceDir, ctx.mcp);
    try {
      for (const [index, resume] of attempts.entries()) {
        const state: CursorState = { sessionId: null, finished: false, failed: null };
        const args = [
          ...(input.bot.brain.args ?? []),
          ...cursorArgs({
            prompt: renderFullPrompt(input, resume !== null),
            model: input.bot.brain.model,
            workspace: ctx.workspaceDir,
            resume,
            mcp: ctx.mcp !== null,
          }),
        ];
        let emitted = false;
        let exitMessage: string | null = null;
        for await (const ev of runProcess({ command, args, cwd: ctx.workspaceDir, env: harnessEnv(), signal: ctx.signal })) {
          if (ev.type === "line") {
            let obj: Json;
            try {
              obj = JSON.parse(ev.line) as Json;
            } catch {
              continue;
            }
            for (const mapped of mapCursorEvent(obj, state)) {
              emitted = true;
              yield mapped;
            }
          } else if (ev.code !== 0 || ev.timedOut || ev.aborted || ev.spawnError) {
            exitMessage = describeExit(ev, ctx.timeoutMs);
          }
        }
        if (state.finished) {
          if (state.sessionId) ctx.sessions.set(state.sessionId);
          return;
        }
        // A stored chat that no longer resumes: forget it and start a new one.
        if (resume && !emitted && !ctx.signal.aborted && index < attempts.length - 1) {
          ctx.sessions.clear();
          continue;
        }
        yield { type: "run.failed", error: state.failed ?? exitMessage ?? "Cursor ended without a result" };
        return;
      }
    } finally {
      restore();
    }
  },
};
