// The account-level tool registry (specs/tool-gateway, ADR 0004).
import type { TSchema } from "typebox";
import { Compile } from "typebox/compile";
import { createHash } from "node:crypto";
import { globToRegExp, toolAllowed, type Bot, type PolicyDecision, type Run } from "@orbis/shared";
import type { ToolCallResult, ToolDescriptor } from "../brains/types.js";

/** The allowlist helpers live in @orbis/shared so the apps read allowlists the same way. */
export { globToRegExp, toolAllowed };

export type RiskClass = "read" | "write" | "external";

/** contracts/hub-surface § Budgets: tool-result (output). */
export const TOOL_RESULT_CAP = 20_000;

export interface ToolContext {
  run: Run;
  bot: Bot;
  callId: string;
  signal: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input: TSchema;
  risk: RiskClass;
  /** Decision when no rule and no grant match (specs/approvals: `ask` for shell and routine.create), or one per bot. */
  defaultDecision?: Exclude<PolicyDecision, "deny"> | ((bot: Bot) => Exclude<PolicyDecision, "deny">);
  /** Tools that are themselves the gate (approval_prompt) skip the policy. */
  ungated?: boolean;
  /** The tool acts outside Orbis and may receive `{{secret:NAME}}` values (ADR 0008). */
  secrets?: boolean;
  /** Offer the tool only to some bots (approval_prompt: Claude Code runs only). */
  offer?(bot: Bot): boolean;
  /** The id of the external MCP server the tool comes from: a bot gets it only when its allowlist names it (`mcp.<server>.*`). */
  external?: string;
  handler(input: any, ctx: ToolContext): Promise<string | ToolCallResult>;
}

/** The decision of a tool when no rule and no grant match, for this bot. */
export function defaultDecisionOf(tool: Pick<ToolDefinition, "defaultDecision"> | undefined, bot: Bot): Exclude<PolicyDecision, "deny"> | undefined {
  const d = tool?.defaultDecision;
  return typeof d === "function" ? d(bot) : d;
}

export function matchesAny(name: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(name));
}

/** Cut a result at the cap and say so. */
export function capResult(text: string, cap = TOOL_RESULT_CAP): string {
  if (text.length <= cap) return text;
  const marker = `\n[… truncated: ${text.length - cap} more characters]`;
  return text.slice(0, cap) + marker;
}

/** Wrap content that came from outside Orbis so brains treat it as data. */
export function untrusted(source: string, content: string): string {
  const safeSource = source.replace(/"/g, "%22");
  const body = content.replace(/<\/untrusted-content>/gi, "</untrusted_content>");
  return `<untrusted-content source="${safeSource}">\n${body}\n</untrusted-content>`;
}

/**
 * The longest name a tool may have on the wire. Model APIs take at most 64
 * characters (`^[a-zA-Z0-9_-]{1,64}$`) and Claude Code prefixes Orbis's tools
 * with `mcp__orbis__` (12): a longer name made the API refuse the whole
 * request, so every reply of the bot failed.
 */
export const WIRE_NAME_MAX = 52;

/**
 * Tool names travel with dots inside Orbis and underscores on the wire; a
 * name too long keeps its start and gets a short hash of the whole name, so
 * it stays unique and maps back.
 */
export function toWireName(name: string): string {
  const wire = name.replace(/[^A-Za-z0-9_-]/g, "_");
  if (wire.length <= WIRE_NAME_MAX) return wire;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${wire.slice(0, WIRE_NAME_MAX - 9)}_${hash}`;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly validators = new Map<string, ReturnType<typeof Compile>>();

  register(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool);
    try {
      this.validators.set(tool.name, Compile(tool.input));
    } catch {
      // A schema from an external server that does not compile: the server validates its own input.
      this.validators.delete(tool.name);
    }
    return this;
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.validators.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Resolve a name as sent by a brain: `team.handoff` or its wire form `team_handoff`. */
  resolve(name: string): ToolDefinition | undefined {
    return this.tools.get(name) ?? [...this.tools.values()].find((t) => toWireName(t.name) === name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Whether a bot may call the tool: offered to it and inside its allowlist. */
  allowed(bot: Bot, tool: ToolDefinition): boolean {
    if (tool.offer && !tool.offer(bot)) return false;
    if (tool.ungated) return true;
    return toolAllowed(tool.name, bot.tools, tool.external !== undefined);
  }

  forBot(bot: Bot): ToolDefinition[] {
    return this.list().filter((t) => this.allowed(bot, t));
  }

  descriptors(bot: Bot): ToolDescriptor[] {
    return this.forBot(bot).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input as unknown as Record<string, unknown> }));
  }

  /** Null when the input matches the tool's schema, else a readable list of problems. */
  validate(name: string, input: unknown): string | null {
    const validator = this.validators.get(name);
    if (!validator || validator.Check(input)) return null;
    const problems = [...validator.Errors(input)]
      .slice(0, 5)
      .map((e) => `${(e as { instancePath?: string }).instancePath || "input"}: ${(e as { message?: string }).message ?? "invalid"}`);
    return problems.join("; ") || "invalid input";
  }
}
