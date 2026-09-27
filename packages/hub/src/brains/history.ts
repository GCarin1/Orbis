// The conversation as chat turns for API brains: the user and other bots speak
// as "user" (other bots named inline), this bot speaks as "assistant".
import type { BrainInput } from "./types.js";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** History plus the task as alternating-friendly turns that start with the user. */
export function chatTurns(input: BrainInput): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const h of input.context.history) {
    if (h.role === "assistant") {
      if (turns.length === 0) continue; // a conversation must start with the user
      turns.push({ role: "assistant", text: h.text });
    } else {
      turns.push({ role: "user", text: h.author === "user" ? h.text : `[${h.author}] ${h.text}` });
    }
  }
  const task = input.skill ? `Follow the skill "${input.skill.name}":\n${input.skill.body.trim()}\n\nTask:\n${input.task}` : input.task;
  turns.push({ role: "user", text: task });
  return turns;
}
