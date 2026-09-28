// The run engine: one FIFO queue per (bot, conversation), the run record, the
// bot state machine and the loop that turns brain events into steps, usage and
// the reply (specs/conversations, specs/bots, specs/agent-runtimes).
import { emptyUsage, type Bot, type BotState, type Run, type RunTrigger, type Step, type Usage } from "@orbis/shared";
import type { EventBus } from "../bus.js";
import type { HubConfig } from "../config.js";
import { assembleContext } from "../context/assemble.js";
import type { ComputerManager } from "../computer/manager.js";
import { newId, nowIso } from "../ids.js";
import type { BotsRepo } from "../repos/bots.js";
import type { ItemsRepo } from "../repos/conversations.js";
import type { MemoryRepo } from "../repos/memory.js";
import type { BrainSessionsRepo, RunsRepo } from "../repos/runs.js";
import type { Timeline } from "../services/timeline.js";
import { NO_TOOLS, type BrainEvent, type BrainRegistry, type McpWiring, type ToolBridge } from "../brains/types.js";

export interface EnqueueRequest {
  botId: string;
  conversationId: string | null;
  trigger: RunTrigger;
  input: string;
  depth?: number;
  skill?: { name: string; body: string } | null;
  /** The item carrying the task; left out of the context history. */
  triggerItemId?: string | null;
  /** Parent id for the reply message (thread replies, handoff cards). */
  replyParentId?: string | null;
  /** Put the conversation's recent history in the context (default true; handoffs pass false). */
  includeHistory?: boolean;
}

/** What the tool gateway provides to a run (change 0002 replaces the default). */
export interface RunToolHost {
  open(run: Run, bot: Bot, signal: AbortSignal): { tools: ToolBridge; mcp: McpWiring | null; close(): void };
}

export const NO_TOOL_HOST: RunToolHost = {
  open: () => ({ tools: NO_TOOLS, mcp: null, close: () => undefined }),
};

/** Hooks other capabilities use to observe or veto runs. */
export interface RunHooks {
  /** Return a message to refuse the run before it starts (spend cap). */
  beforeStart?(run: Run, bot: Bot): string | null;
  /** Called after each usage event; return a message to stop the run (spend cap). */
  afterUsage?(run: Run, bot: Bot, usage: Usage): string | null;
  /** Called when a run that started ends, whatever its status. */
  onFinished?(run: Run, bot: Bot): void;
  /** Called when a run starts executing. */
  onStarted?(run: Run): void;
  /** Called for every run that reaches done, failed or cancelled, started or not. */
  onEnded?(run: Run): void;
}

export interface EngineDeps {
  config: HubConfig;
  bus: EventBus;
  bots: BotsRepo;
  items: ItemsRepo;
  runs: RunsRepo;
  sessions: BrainSessionsRepo;
  memory: MemoryRepo;
  brains: BrainRegistry;
  computer: ComputerManager;
  timeline: Timeline;
  secret(botId: string, name: string): string | null;
}

interface Pending {
  req: EnqueueRequest;
}

export class RunEngine {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly waiters = new Map<string, Array<(run: Run) => void>>();
  private readonly pending = new Map<string, Pending>();
  private readonly inflight = new Set<Promise<void>>();
  private toolHost: RunToolHost = NO_TOOL_HOST;
  private readonly hooks: RunHooks[] = [];
  private readonly contextSections: Array<(bot: Bot) => string | null> = [];
  private redactor: (<T>(botId: string, value: T) => T) | null = null;
  private stopped = false;

  constructor(private readonly d: EngineDeps) {}

  setToolHost(host: RunToolHost): void {
    this.toolHost = host;
  }

  addHooks(hooks: RunHooks): void {
    this.hooks.push(hooks);
  }

  /** Mask secret values in everything a run stores or publishes (steps, reply, error). */
  setRedactor(redactor: <T>(botId: string, value: T) => T): void {
    this.redactor = redactor;
  }

  /** Add a section to every run's system text (the offered skills). */
  addContextSection(section: (bot: Bot) => string | null): void {
    this.contextSections.push(section);
  }

  /** Create a queued run and chain it behind the runs of the same bot and conversation. */
  enqueue(req: EnqueueRequest): Run {
    const run: Run = {
      id: newId("run"),
      botId: req.botId,
      conversationId: req.conversationId,
      trigger: req.trigger,
      depth: req.depth ?? 0,
      status: "queued",
      input: req.input,
      skill: req.skill?.name ?? null,
      steps: [],
      reply: null,
      usage: emptyUsage(),
      error: null,
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
    };
    this.d.runs.insert(run);
    this.pending.set(run.id, { req });
    this.publishRun(run.id);

    const key = `${req.botId}:${req.conversationId ?? "-"}`;
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(() => this.execute(run.id)).catch(() => undefined);
    this.chains.set(key, next);
    this.inflight.add(next);
    void next.finally(() => {
      this.inflight.delete(next);
      if (this.chains.get(key) === next) this.chains.delete(key);
    });
    return run;
  }

  /** Resolve when the run reaches done, failed or cancelled. */
  wait(runId: string): Promise<Run> {
    const run = this.d.runs.get(runId);
    if (run && ["done", "failed", "cancelled"].includes(run.status)) return Promise.resolve(run);
    return new Promise((resolve) => {
      const list = this.waiters.get(runId) ?? [];
      list.push(resolve);
      this.waiters.set(runId, list);
    });
  }

  cancel(runId: string): boolean {
    const run = this.d.runs.get(runId);
    if (!run) return false;
    if (run.status === "queued") {
      this.finish(runId, "cancelled", { error: "cancelled" });
      return true;
    }
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort(new Error("cancelled"));
      return true;
    }
    return false;
  }

  activeRuns(botId: string): Run[] {
    return this.d.runs.active(botId);
  }

  cancelBot(botId: string): void {
    for (const run of this.d.runs.active(botId)) this.cancel(run.id);
  }

  /** Resolve once every queued and running run has settled. */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight]);
    }
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    for (const controller of this.controllers.values()) controller.abort(new Error("hub stopping"));
    await this.idle();
  }

  // ---------------------------------------------------------------------------

  private publishRun(runId: string): Run | undefined {
    const run = this.d.runs.get(runId);
    if (!run) return undefined;
    const { steps: _steps, ...rest } = run;
    this.d.bus.publish("run.updated", { run: rest });
    return run;
  }

  /** A run starts or stops waiting for the user (an approval or a secret request). */
  markWaiting(runId: string, waiting: boolean): void {
    const run = this.d.runs.get(runId);
    if (!run || !["running", "waiting"].includes(run.status)) return;
    this.d.runs.setStatus(runId, waiting ? "waiting" : "running");
    this.publishRun(runId);
    this.setBotState(run.botId, waiting ? "waiting" : "working");
  }

  setBotState(botId: string, state: BotState): void {
    const bot = this.d.bots.get(botId);
    if (!bot || bot.state === state) return;
    this.d.bots.setState(botId, state);
    this.d.bus.publish("bot.state", { botId, state });
  }

  private finish(runId: string, status: "done" | "failed" | "cancelled", fields: { error?: string | null; reply?: string | null }): Run {
    this.d.runs.setStatus(runId, status, { finishedAt: nowIso(), ...fields });
    this.pending.delete(runId);
    const ended = this.d.runs.get(runId)!;
    // Hooks run before the terminal event, so follow-up runs they start (handoffs,
    // mentions) are announced before the run that caused them is reported as ended.
    for (const hook of this.hooks) {
      try {
        hook.onEnded?.(ended);
      } catch (err) {
        console.error("run hook onEnded failed:", err);
      }
    }
    const run = this.publishRun(runId)!;
    for (const resolve of this.waiters.get(runId) ?? []) resolve(run);
    this.waiters.delete(runId);
    return run;
  }

  private async execute(runId: string): Promise<void> {
    const queued = this.d.runs.get(runId);
    const pending = this.pending.get(runId);
    if (!queued || !pending || queued.status !== "queued") return;
    const { req } = pending;

    const bot = this.d.bots.get(queued.botId);
    if (!bot) {
      this.finish(runId, "failed", { error: "the bot was deleted" });
      return;
    }
    if (this.stopped) {
      this.finish(runId, "cancelled", { error: "hub stopping" });
      return;
    }

    for (const hook of this.hooks) {
      const refusal = hook.beforeStart?.(queued, bot);
      if (refusal) {
        this.failRun(queued, bot, refusal);
        return;
      }
    }

    const adapter = this.d.brains.get(bot.brain.kind);
    const secret = (name: string) => this.d.secret(bot.id, name);
    const misconfigured = adapter
      ? adapter.check(bot, this.d.config, secret)
      : `brain "${bot.brain.kind}" is not available in this hub`;
    if (misconfigured) {
      this.failRun(queued, bot, misconfigured);
      return;
    }

    const controller = new AbortController();
    this.controllers.set(runId, controller);
    this.d.runs.setStatus(runId, "running", { startedAt: nowIso() });
    let run = this.publishRun(runId)!;
    this.setBotState(bot.id, "thinking");
    for (const hook of this.hooks) hook.onStarted?.(run);

    const timeoutMs = (bot.brain.timeoutSec ?? 900) * 1000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("timeout"));
    }, timeoutMs);

    const steps: Step[] = [];
    const usage: Usage = emptyUsage();
    let reply: string | null = null;
    let lastText: string | null = null;
    let failure: string | null = null;
    const host = this.toolHost.open(run, bot, controller.signal);

    const pushStep = (raw: Step) => {
      // Secret values never reach stored or published steps (specs/secrets).
      const step = this.redactor ? this.redactor(bot.id, raw) : raw;
      steps.push(step);
      this.d.runs.setSteps(runId, steps);
      this.d.bus.publish("run.step", { runId, conversationId: run.conversationId, botId: bot.id, step });
    };

    try {
      const workspaceDir = this.d.computer.ensureWorkspace(bot.id);
      const conversationId = req.conversationId;
      const sessionKey = conversationId ?? `run:${runId}`;
      const resumable = bot.brain.kind === "claude-code" || bot.brain.kind === "codex" || bot.brain.kind === "cursor";
      const storedSession = resumable ? this.d.sessions.get(bot.id, sessionKey, bot.brain.kind) : null;
      // A CLI brain resuming its own session already holds the earlier turns.
      const since = storedSession && conversationId ? (this.d.runs.lastFinished(bot.id, conversationId, runId)?.finishedAt ?? null) : null;

      const context = assembleContext(
        {
          bot,
          conversationId: req.includeHistory === false ? null : conversationId,
          task: req.input,
          excludeItemId: req.triggerItemId ?? null,
          since,
        },
        { items: this.d.items, memory: this.d.memory, bots: this.d.bots },
      );
      const sections = this.contextSections.map((section) => section(bot)).filter((text): text is string => Boolean(text));
      if (sections.length) context.identity = [context.identity, ...sections].join("\n\n");

      const events = adapter!.run(
        { runId, bot, conversationId, task: req.input, context, skill: req.skill ?? null },
        {
          signal: controller.signal,
          workspaceDir,
          timeoutMs,
          config: this.d.config,
          tools: host.tools,
          mcp: host.mcp,
          secret,
          sessions: {
            get: () => this.d.sessions.get(bot.id, sessionKey, bot.brain.kind),
            set: (id) => this.d.sessions.set(bot.id, sessionKey, bot.brain.kind, id),
            clear: () => this.d.sessions.clear(bot.id, sessionKey, bot.brain.kind),
          },
        },
      );

      for await (const ev of events as AsyncIterable<BrainEvent>) {
        if (controller.signal.aborted) break;
        const at = nowIso();
        switch (ev.type) {
          case "run.started":
            break;
          case "step.thinking":
            pushStep({ type: "thinking", at, text: ev.text });
            this.setBotState(bot.id, "thinking");
            break;
          case "step.text":
            lastText = ev.text;
            pushStep({ type: "text", at, text: ev.text });
            break;
          case "step.tool_call":
            pushStep({ type: "tool_call", at, tool: ev.tool, callId: ev.callId, input: ev.input });
            this.setBotState(bot.id, "working");
            break;
          case "step.tool_result":
            pushStep({ type: "tool_result", at, tool: ev.tool, callId: ev.callId, output: ev.output, isError: ev.isError });
            this.setBotState(bot.id, "thinking");
            break;
          case "run.usage": {
            usage.inputTokens += ev.inputTokens;
            usage.outputTokens += ev.outputTokens;
            usage.cachedTokens += ev.cachedTokens;
            usage.costUsd += ev.costUsd;
            usage.subscription = usage.subscription || ev.subscription;
            this.d.runs.setUsage(runId, usage);
            run = this.d.runs.get(runId)!;
            for (const hook of this.hooks) {
              const stop = hook.afterUsage?.(run, bot, usage);
              if (stop) {
                failure = stop;
                controller.abort(new Error(stop));
              }
            }
            break;
          }
          case "run.finished":
            reply = ev.reply;
            break;
          case "run.failed":
            failure = ev.error;
            break;
        }
        if (failure) break;
      }
    } catch (err) {
      if (!controller.signal.aborted) failure = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
      host.close();
      this.controllers.delete(runId);
    }

    this.d.runs.setUsage(runId, usage);
    run = this.d.runs.get(runId)!;

    if (!failure && controller.signal.aborted) {
      if (timedOut) failure = `timed out after ${Math.round(timeoutMs / 1000)}s`;
      else {
        this.finish(runId, "cancelled", { error: "cancelled" });
        this.setBotState(bot.id, "idle");
        this.notifyFinished(runId, bot);
        return;
      }
    }
    if (!failure && (reply === null || reply.trim() === "")) reply = lastText;
    if (!failure && (reply === null || reply.trim() === "")) failure = "the brain returned no reply";
    if (this.redactor) {
      if (reply !== null) reply = this.redactor(bot.id, reply);
      if (failure !== null) failure = this.redactor(bot.id, failure);
    }

    if (failure) {
      this.failRun(run, bot, failure);
      return;
    }

    if (run.conversationId) {
      this.d.timeline.post({
        conversationId: run.conversationId,
        kind: "message",
        author: { type: "bot", id: bot.id },
        text: reply!,
        parentId: req.replyParentId ?? null,
        runId,
      });
    }
    this.finish(runId, "done", { reply });
    this.setBotState(bot.id, "done");
    this.notifyFinished(runId, bot);
  }

  private failRun(run: Run, bot: Bot, error: string): void {
    this.finish(run.id, "failed", { error });
    if (run.conversationId) {
      this.d.timeline.event(run.conversationId, "run.failed", `${bot.name}: ${error}`, { runId: run.id, botId: bot.id, error }, run.id);
    }
    this.setBotState(bot.id, "blocked");
    this.notifyFinished(run.id, bot);
  }

  private notifyFinished(runId: string, bot: Bot): void {
    const run = this.d.runs.get(runId);
    if (!run) return;
    for (const hook of this.hooks) {
      try {
        hook.onFinished?.(run, bot);
      } catch (err) {
        console.error("run hook onFinished failed:", err);
      }
    }
  }
}
