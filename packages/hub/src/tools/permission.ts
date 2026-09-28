// `approval_prompt`: Claude Code's permission prompts decided by the Orbis policy.
import Type from "typebox";
import type { ApprovalService } from "../approvals/service.js";
import { defaultDecisionOf, type ToolDefinition, type ToolRegistry } from "./registry.js";

/** Claude Code built-in tools and the Orbis tool with the same effect (specs/approvals). */
export const CLAUDE_TOOL_EQUIVALENTS: Record<string, string> = {
  Bash: "computer.shell",
  Write: "computer.write_file",
  Edit: "computer.write_file",
  MultiEdit: "computer.write_file",
  NotebookEdit: "computer.write_file",
  Read: "computer.read_file",
  Glob: "computer.read_file",
  Grep: "computer.read_file",
  LS: "computer.read_file",
  WebFetch: "http.fetch",
  WebSearch: "http.fetch",
};

/** Defaults for equivalents whose tool is not registered yet (specs/approvals defaults). */
const DEFAULT_ASK = new Set(["computer.shell", "routine.create"]);

export function permissionTool(approvals: ApprovalService, registry: ToolRegistry): ToolDefinition {
  return {
    name: "approval_prompt",
    description: "Answers Claude Code permission prompts with the Orbis policy. Called by Claude Code itself.",
    input: Type.Object({
      tool_name: Type.String(),
      input: Type.Optional(Type.Unknown()),
      tool_use_id: Type.Optional(Type.String()),
    }),
    risk: "read",
    ungated: true,
    offer: (bot) => bot.brain.kind === "claude-code",
    async handler(input: { tool_name: string; input?: unknown }, ctx) {
      const allow = () => JSON.stringify({ behavior: "allow", updatedInput: input.input ?? {} });
      // Orbis's own MCP tools are gated when they execute.
      if (input.tool_name.startsWith("mcp__orbis__")) return allow();
      const equivalent = CLAUDE_TOOL_EQUIVALENTS[input.tool_name];
      if (!equivalent) return allow();
      const registered = registry.get(equivalent);
      const gate = await approvals.gate({
        run: ctx.run,
        bot: ctx.bot,
        tool: equivalent,
        defaultDecision: defaultDecisionOf(registered, ctx.bot) ?? (DEFAULT_ASK.has(equivalent) ? "ask" : "allow"),
        input: { claudeTool: input.tool_name, input: input.input ?? {} },
        signal: ctx.signal,
      });
      return gate.allowed ? allow() : JSON.stringify({ behavior: "deny", message: gate.message });
    },
  };
}
