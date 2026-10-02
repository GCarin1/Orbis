// Any command as a brain (contracts/cli-harnesses § custom-cli): the prompt goes
// into the `{prompt}` argument or stdin, and all of stdout is the reply.
import { describeExit, harnessEnv, resolveExecutable, runProcess } from "./process.js";
import { renderFullPrompt } from "./prompt.js";
import type { BrainAdapter, BrainContext, BrainEvent, BrainInput } from "./types.js";

export const customCliBrain: BrainAdapter = {
  kind: "custom-cli",

  check(bot) {
    if (!bot.brain.command) return "custom-cli brain: no command configured";
    return resolveExecutable(bot.brain.command) ? null : `custom-cli brain: executable "${bot.brain.command}" not found`;
  },

  async *run(input: BrainInput, ctx: BrainContext): AsyncGenerator<BrainEvent> {
    const command = resolveExecutable(input.bot.brain.command!)!;
    const prompt = renderFullPrompt(input);
    const template = input.bot.brain.args ?? [];
    const usesArg = template.some((a) => a.includes("{prompt}"));
    const args = template.map((a) => a.replaceAll("{prompt}", prompt));

    yield { type: "run.started" };
    const lines: string[] = [];
    for await (const ev of runProcess({
      command,
      args,
      cwd: ctx.workspaceDir,
      env: harnessEnv(),
      stdin: usesArg ? undefined : prompt,
      signal: ctx.signal,
    })) {
      if (ev.type === "line") {
        lines.push(ev.line);
        continue;
      }
      const clean = ev.code === 0 && !ev.timedOut && !ev.aborted && !ev.spawnError;
      const reply = lines.join("\n").trim();
      if (!clean) {
        yield { type: "run.failed", error: describeExit(ev, ctx.timeoutMs) };
        return;
      }
      if (!reply) {
        yield { type: "run.failed", error: "the command printed no reply" };
        return;
      }
      yield { type: "step.text", text: reply };
      yield { type: "run.finished", reply };
    }
  },
};
