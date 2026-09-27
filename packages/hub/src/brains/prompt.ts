// Rendering the assembled context for brains that take one text prompt (CLI brains).
import type { AssembledContext } from "../context/assemble.js";
import type { BrainInput } from "./types.js";

export function renderMemories(ctx: AssembledContext): string {
  if (ctx.memories.length === 0) return "";
  const lines = ctx.memories.map((m) => `- (${m.kind}${m.botId === null ? ", team" : ""}) ${m.text}`);
  return ["What you remember:", ...lines].join("\n");
}

export function renderHistory(ctx: AssembledContext): string {
  if (ctx.history.length === 0) return "";
  const lines = ctx.history.map((h) => `[${h.author}] ${h.text}`);
  return ["Recent conversation (oldest first):", ...lines].join("\n");
}

/** The system text: identity plus memories. */
export function renderSystem(input: BrainInput): string {
  return [input.context.identity, renderMemories(input.context)].filter(Boolean).join("\n\n");
}

/** The user-turn text: recent conversation, the invoked skill and the task. */
export function renderTask(input: BrainInput): string {
  const parts: string[] = [];
  const history = renderHistory(input.context);
  if (history) parts.push(history);
  if (input.skill) {
    parts.push(`Follow the skill "${input.skill.name}":\n${input.skill.body.trim()}`);
  }
  parts.push(`Task:\n${input.task}`);
  return parts.join("\n\n");
}

/** One prompt holding everything, for brains with no separate system prompt. */
export function renderFullPrompt(input: BrainInput): string {
  return `${renderSystem(input)}\n\n${renderTask(input)}`;
}
