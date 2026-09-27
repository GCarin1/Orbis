// The brain adapter interface and the normalized events of specs/agent-runtimes (ADR 0003).
import type { Bot, BrainKind } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import type { AssembledContext } from "../context/assemble.js";

export interface BrainInput {
  runId: string;
  bot: Bot;
  conversationId: string | null;
  /** The task of the moment: the user's message, a handoff task or a routine instruction. */
  task: string;
  context: AssembledContext;
  /** Instructions of the invoked skill, when the run was started with /<skill>. */
  skill: { name: string; body: string } | null;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  output: string;
  isError: boolean;
}

/** What a brain can do with tools during one run. */
export interface ToolBridge {
  list(): ToolDescriptor[];
  call(name: string, input: unknown, callId: string): Promise<ToolCallResult>;
}

export interface SessionStore {
  get(): string | null;
  set(sessionId: string): void;
  clear(): void;
}

/** How a CLI brain reaches the tool gateway over MCP (filled by the tool gateway). */
export interface McpWiring {
  /** MCP server entry: command, args and env for the `orbis mcp` stdio bridge. */
  server: { command: string; args: string[]; env: Record<string, string> };
  /** Name of the MCP tool that answers Claude Code permission prompts. */
  permissionTool: string | null;
}

export interface BrainContext {
  signal: AbortSignal;
  workspaceDir: string;
  timeoutMs: number;
  sessions: SessionStore;
  tools: ToolBridge;
  config: HubConfig;
  /** Present when the tool gateway can be reached over MCP. */
  mcp: McpWiring | null;
  /** Resolve a bot secret by name (API keys for API brains); null when absent. */
  secret(name: string): string | null;
}

export type BrainEvent =
  | { type: "run.started"; sessionId?: string }
  | { type: "step.thinking"; text: string }
  | { type: "step.text"; text: string }
  | { type: "step.tool_call"; callId: string; tool: string; input: unknown }
  | { type: "step.tool_result"; callId: string; tool: string; output: string; isError: boolean }
  | {
      type: "run.usage";
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      costUsd: number;
      subscription: boolean;
    }
  | { type: "run.finished"; reply: string }
  | { type: "run.failed"; error: string };

export interface BrainAdapter {
  readonly kind: BrainKind;
  /** A message naming what is missing from the bot's brain configuration, or null when runnable. */
  check(bot: Bot, config: HubConfig, secret: (name: string) => string | null): string | null;
  run(input: BrainInput, ctx: BrainContext): AsyncIterable<BrainEvent>;
}

export class BrainRegistry {
  private readonly adapters = new Map<BrainKind, BrainAdapter>();

  register(adapter: BrainAdapter): this {
    this.adapters.set(adapter.kind, adapter);
    return this;
  }

  get(kind: BrainKind): BrainAdapter | undefined {
    return this.adapters.get(kind);
  }

  kinds(): BrainKind[] {
    return [...this.adapters.keys()];
  }
}

/** A tool bridge with no tools: every call returns an error result. */
export const NO_TOOLS: ToolBridge = {
  list: () => [],
  call: async (name) => ({ output: `unknown tool: ${name}`, isError: true }),
};
