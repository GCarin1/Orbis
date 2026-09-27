// Google Gemini CLI as a subscription brain (contracts/cli-harnesses § gemini-cli).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describeExit, harnessEnv, resolveExecutable, runProcess } from "./process.js";
import { renderFullPrompt } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput, McpWiring } from "./types.js";

type Json = Record<string, any>;

export function geminiArgs(o: { prompt: string; model?: string }): string[] {
  return ["-p", o.prompt, "--output-format", "stream-json", ...(o.model ? ["-m", o.model] : [])];
}

/**
 * Put the Orbis MCP server into `<workspace>/.gemini/settings.json`, keeping
 * whatever else the file holds; returns a function that restores the file.
 */
export function installGeminiSettings(workspace: string, mcp: McpWiring | null): () => void {
  if (!mcp) return () => undefined;
  const dir = path.join(workspace, ".gemini");
  const file = path.join(dir, "settings.json");
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;
  let settings: Json = {};
  try {
    settings = previous ? (JSON.parse(previous) as Json) : {};
  } catch {
    settings = {};
  }
  settings.mcpServers = { ...(settings.mcpServers ?? {}), orbis: { command: mcp.server.command, args: mcp.server.args, env: mcp.server.env, trust: true } };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
  return () => {
    if (previous === null) rmSync(file, { force: true });
    else writeFileSync(file, previous);
  };
}

export interface GeminiState {
  text: string;
  finished: boolean;
  failed: string | null;
  sawJsonLines: boolean;
}

/** Map one stream-json object to normalized events. */
export function mapGeminiEvent(obj: Json, state: GeminiState): BrainEvent[] {
  const out: BrainEvent[] = [];
  const flush = () => {
    if (state.text.trim()) out.push({ type: "step.text", text: state.text });
  };
  switch (obj.type) {
    case "init":
      out.push({ type: "run.started", sessionId: typeof obj.session_id === "string" ? obj.session_id : undefined });
      break;
    case "message":
      if (obj.role === "assistant" && typeof obj.content === "string") {
        state.text = obj.delta ? state.text + obj.content : obj.content;
      }
      break;
    case "tool_use":
      flush();
      state.text = "";
      out.push({ type: "step.tool_call", callId: String(obj.tool_id ?? ""), tool: String(obj.tool_name ?? "tool"), input: obj.parameters ?? {} });
      break;
    case "tool_result":
      out.push({
        type: "step.tool_result",
        callId: String(obj.tool_id ?? ""),
        tool: String(obj.tool_name ?? "tool"),
        output: typeof obj.output === "string" ? obj.output : JSON.stringify(obj.output ?? obj.error ?? ""),
        isError: obj.status === "error",
      });
      break;
    case "result": {
      const s = (obj.stats ?? {}) as Json;
      out.push({ type: "run.usage", inputTokens: Number(s.input_tokens ?? 0), outputTokens: Number(s.output_tokens ?? 0), cachedTokens: Number(s.cached ?? 0), costUsd: 0, subscription: true });
      if (obj.status && obj.status !== "success") state.failed = String(obj.error?.message ?? `Gemini CLI finished with status ${obj.status}`);
      else state.finished = true;
      break;
    }
    case "error":
      state.failed = String(obj.message ?? obj.error?.message ?? "Gemini CLI reported an error");
      break;
  }
  return out;
}

export const geminiBrain: BrainAdapter = {
  kind: "gemini-cli",

  check(bot) {
    const command = bot.brain.command ?? "gemini";
    return resolveExecutable(command) ? null : `gemini-cli brain: executable "${command}" not found on PATH`;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const command = resolveExecutable(input.bot.brain.command ?? "gemini")!;
    const restore = installGeminiSettings(ctx.workspaceDir, ctx.mcp);
    const state: GeminiState = { text: "", finished: false, failed: null, sawJsonLines: false };
    const raw: string[] = [];
    let exitMessage: string | null = null;
    try {
      for await (const ev of runProcess({
        command,
        args: [...(input.bot.brain.args ?? []), ...geminiArgs({ prompt: renderFullPrompt(input), model: input.bot.brain.model })],
        cwd: ctx.workspaceDir,
        env: harnessEnv(),
        timeoutMs: ctx.timeoutMs,
        signal: ctx.signal,
      })) {
        if (ev.type === "line") {
          raw.push(ev.line);
          let obj: Json | null = null;
          try {
            const parsed = JSON.parse(ev.line) as unknown;
            obj = parsed && typeof parsed === "object" && "type" in (parsed as Json) ? (parsed as Json) : null;
          } catch {
            obj = null;
          }
          if (!obj) continue;
          state.sawJsonLines = true;
          yield* mapGeminiEvent(obj, state);
        } else if (ev.code !== 0 || ev.timedOut || ev.aborted || ev.spawnError) {
          exitMessage = describeExit(ev, ctx.timeoutMs);
        }
      }
    } finally {
      restore();
    }

    // Older CLIs: one JSON document (`--output-format json`) instead of JSON Lines.
    if (!state.sawJsonLines && raw.length) {
      try {
        const doc = JSON.parse(raw.join("\n")) as Json;
        if (doc.error) state.failed = String(doc.error.message ?? JSON.stringify(doc.error));
        else if (typeof doc.response === "string") {
          state.text = doc.response;
          state.finished = true;
        }
      } catch {
        /* not JSON either */
      }
    }

    if (state.failed) {
      yield { type: "run.failed", error: state.failed };
    } else if (!state.text.trim()) {
      yield { type: "run.failed", error: exitMessage ?? "Gemini CLI ended without a reply" };
    } else if (exitMessage && !state.finished) {
      yield { type: "run.failed", error: exitMessage };
    } else {
      yield { type: "step.text", text: state.text };
      yield { type: "run.finished", reply: state.text };
    }
  },
};
