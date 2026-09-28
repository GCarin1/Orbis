// The tool gateway: the engine's tool host for every brain (specs/tool-gateway, ADR 0004).
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bot, Run } from "@orbis/shared";
import type { ApprovalService } from "../approvals/service.js";
import type { McpWiring, ToolBridge, ToolCallResult, ToolDescriptor } from "../brains/types.js";
import type { RunToolHost } from "../runs/engine.js";
import { capResult, defaultDecisionOf, type ToolDefinition, type ToolRegistry } from "./registry.js";

export interface RunSession {
  run: Run;
  bot: Bot;
  signal: AbortSignal;
}

/** The hub's own stdio MCP bridge script (the same code `orbis mcp` runs). */
export function bridgeEntry(): string | null {
  const candidates = [
    new URL("../mcp-bridge.js", import.meta.url), // dist/tools → dist/mcp-bridge.js
    new URL("../../dist/mcp-bridge.js", import.meta.url), // src/tools (tests) → dist/mcp-bridge.js
  ];
  for (const candidate of candidates) {
    const file = fileURLToPath(candidate);
    if (existsSync(file)) return file;
  }
  return null;
}

export const PERMISSION_TOOL = "mcp__orbis__approval_prompt";

/**
 * Runs before every tool handler: it may wait (a takeover), throw to refuse,
 * or return a result that stands in for the tool (a draft-only routine).
 */
export type BeforeToolCall = (session: RunSession, tool: ToolDefinition, input: unknown) => Promise<void | ToolCallResult>;

/** Where secret placeholders are resolved and values redacted (the vault). */
export interface SecretBroker {
  resolve<T>(botId: string, input: T): T;
  redact(botId: string, text: string): string;
  hasPlaceholder(value: unknown): boolean;
}

export class ToolGateway implements RunToolHost {
  private readonly sessions = new Map<string, RunSession>();
  private readonly beforeCall: BeforeToolCall[] = [];
  private secrets: SecretBroker | null = null;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly approvals: ApprovalService,
    private readonly hubUrl: () => string,
    private readonly bridge: string | null = bridgeEntry(),
  ) {}

  open(run: Run, bot: Bot, signal: AbortSignal) {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { run, bot, signal });
    const tools: ToolBridge = {
      list: () => this.descriptors(bot),
      call: (name, input, callId) => this.execute({ run, bot, signal }, name, input, callId),
    };
    const mcp: McpWiring | null = this.bridge
      ? {
          server: { command: process.execPath, args: [this.bridge], env: { ORBIS_URL: this.hubUrl(), ORBIS_RUN_TOKEN: token } },
          permissionTool: bot.brain.kind === "claude-code" ? PERMISSION_TOOL : null,
        }
      : null;
    return {
      tools,
      mcp,
      close: () => {
        this.sessions.delete(token);
        this.approvals.expireForRun(run.id);
      },
    };
  }

  setSecrets(broker: SecretBroker): void {
    this.secrets = broker;
  }

  onBeforeCall(hook: BeforeToolCall): void {
    this.beforeCall.push(hook);
  }

  /** The run a token belongs to, or undefined when unknown or revoked. */
  session(token: string): RunSession | undefined {
    return this.sessions.get(token);
  }

  descriptors(bot: Bot): ToolDescriptor[] {
    return this.registry.descriptors(bot);
  }

  toolsFor(bot: Bot): ToolDefinition[] {
    return this.registry.forBot(bot);
  }

  /** Allowlist → schema → policy/approval → before-call hooks (takeover) → handler → result cap. */
  async execute(session: RunSession, name: string, input: unknown, callId: string): Promise<ToolCallResult> {
    const { run, bot, signal } = session;
    const tool = this.registry.resolve(name);
    if (!tool || !this.registry.allowed(bot, tool)) {
      return { output: `tool "${name}" is not available to @${bot.handle}`, isError: true };
    }
    const args = input ?? {};
    const invalid = this.registry.validate(tool.name, args);
    if (invalid) return { output: `invalid input for ${tool.name}: ${invalid}`, isError: true };

    if (!tool.ungated) {
      const gate = await this.approvals.gate({
        run,
        bot,
        tool: tool.name,
        defaultDecision: defaultDecisionOf(tool, bot) ?? "allow",
        input: args,
        reason: typeof (args as { reason?: unknown }).reason === "string" ? (args as { reason: string }).reason : null,
        signal,
      });
      if (!gate.allowed) return { output: gate.message, isError: true };
    }
    try {
      let result: string | ToolCallResult | undefined;
      for (const hook of this.beforeCall) {
        result = (await hook(session, tool, args)) ?? undefined;
        if (result) break;
      }
      if (!result) {
        // Placeholders become values only here, only for tools that act, and only from this bot's vault.
        let input = args;
        if (this.secrets && tool.secrets && this.secrets.hasPlaceholder(args)) {
          try {
            input = this.secrets.resolve(bot.id, args);
          } catch (err) {
            const names = (err as { names?: string[] }).names;
            if (!names) throw err;
            return {
              output: `${names.map((n) => `{{secret:${n}}}`).join(", ")} ${names.length > 1 ? "are" : "is"} not set for @${bot.handle}: ask the user with secret.request {"name":"${names[0]}","reason":"…"}`,
              isError: true,
            };
          }
        }
        result = await tool.handler(input, { run, bot, callId, signal });
      }
      const normalized = typeof result === "string" ? { output: result, isError: false } : result;
      const output = this.secrets ? this.secrets.redact(bot.id, normalized.output) : normalized.output;
      return { output: capResult(output), isError: normalized.isError };
    } catch (err) {
      return { output: `${tool.name} failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }
}
