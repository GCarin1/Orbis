// Tasks given to a Library folder's team (specs/conversations, change 0080-folder-tasks): the user writes what
// to do with the folder; the team works on it in one conversation, where the lead splits the work with
// team.handoff and gathers what comes back (change 0014), each bot keeps what it makes in the folder with
// library.save, and a board shows each bot's step and, at the end, the result. Nothing new orchestrates the
// bots: the task is a message, the coordination is the team's own.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, Conversation, FolderTask, FolderTaskStatus, Run, TaskStepStatus } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run as exec, type Row } from "../db/index.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import { newId } from "../ids.js";
import type { RunHooks } from "../runs/engine.js";
import type { ToolDefinition } from "../tools/registry.js";
import type { LibraryService } from "./service.js";

export const TASKS_KEPT = 20;
const ACTIVE = ["queued", "running", "waiting"];

export class FolderTasks {
  constructor(
    private readonly hub: HubContext,
    private readonly library: LibraryService,
    private readonly clock: () => Date = () => new Date(),
  ) {
    // What a task's runs keep in the Library is the task's.
    library.taskSource = (run) => (this.runningByChain(run.chainId) ? "task" : null);
  }

  /** A hub that stopped mid-task: a task whose runs are all gone ends as failed. */
  start(): void {
    for (const row of all(this.hub.db, "SELECT * FROM folder_tasks WHERE status = 'running'")) {
      if (!this.chainActive(row.chain_id as string)) this.finish(row.id as string, "failed", "Orbis restarted while the team worked.");
    }
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private toTask(r: Row): FolderTask {
    const id = r.id as string;
    return {
      id,
      folderId: r.folder_id as string,
      text: r.text as string,
      conversationId: (r.conversation_id as string | null) ?? null,
      leadBotId: (r.lead_bot_id as string | null) ?? null,
      status: r.status as FolderTaskStatus,
      result: r.result as string,
      steps: all(this.hub.db, "SELECT * FROM task_steps WHERE task_id = ? ORDER BY rowid", id).map((s) => ({
        botId: s.bot_id as string,
        status: s.status as TaskStepStatus,
        note: s.note as string,
        updatedAt: s.updated_at as string,
      })),
      files: all<{ id: string }>(
        this.hub.db,
        "SELECT id FROM files WHERE folder_id = ? AND source = 'task' AND created_at >= ? AND (? IS NULL OR created_at <= ?) ORDER BY created_at",
        r.folder_id as string,
        r.created_at as string,
        (r.ended_at as string | null) ?? null,
        (r.ended_at as string | null) ?? null,
      ).map((f) => f.id),
      createdAt: r.created_at as string,
      endedAt: (r.ended_at as string | null) ?? null,
    };
  }

  task(id: string): FolderTask {
    const row = get(this.hub.db, "SELECT * FROM folder_tasks WHERE id = ?", id);
    if (!row) throw notFound(`task ${id}`);
    return this.toTask(row);
  }

  list(folderId: string): FolderTask[] {
    this.library.folder(folderId);
    return all(this.hub.db, "SELECT * FROM folder_tasks WHERE folder_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?", folderId, TASKS_KEPT).map((r) => this.toTask(r));
  }

  private publish(id: string): void {
    this.hub.bus.publish("folder.task", { task: this.task(id) });
  }

  private runningByChain(chainId: string): Row | undefined {
    return get(this.hub.db, "SELECT * FROM folder_tasks WHERE chain_id = ? AND status = 'running'", chainId);
  }

  private chainActive(chainId: string): boolean {
    return this.hub.repos.runs.inChain(chainId).some((r) => ACTIVE.includes(r.status));
  }

  /**
   * Where the team works: the folder's first group; one bot alone in its direct conversation; several bots in
   * a group of their own for the folder, made once and used again while its members are the same.
   */
  private room(folderId: string, name: string): { conversation: Conversation; members: string[] } {
    const folder = this.library.folder(folderId);
    const groups = folder.groups.map((g) => this.hub.conversationService.get(g));
    if (groups.length) return { conversation: groups[0]!, members: groups[0]!.members };
    const bots = folder.bots.filter((b) => this.hub.repos.bots.get(b));
    if (!bots.length) throw conflict("no_team", "give this folder a team first: bots or a group");
    if (bots.length === 1) return { conversation: this.hub.conversationService.directFor(bots[0]!), members: bots };
    if (bots.length > this.hub.config.maxGroupSize) {
      throw conflict("team_too_large", `a folder's team works in one group, of at most ${this.hub.config.maxGroupSize} bots: give it a group, or fewer bots`);
    }
    const before = get<{ conversation_id: string | null }>(
      this.hub.db,
      "SELECT conversation_id FROM folder_tasks WHERE folder_id = ? AND conversation_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      folderId,
    );
    const known = before?.conversation_id ? this.hub.repos.conversations.get(before.conversation_id) : undefined;
    if (known && known.kind === "group" && [...known.members].sort().join() === [...bots].sort().join()) return { conversation: known, members: known.members };
    const group = this.hub.conversationService.createGroup({ title: `📁 ${name}`.slice(0, 80), members: bots, leadBotId: bots[0]! });
    return { conversation: group, members: group.members };
  }

  /** Give the folder's team a task: it is posted to the team's conversation as the user's message. */
  begin(folderId: string, rawText: string): FolderTask {
    const text = rawText.trim();
    if (!text) throw badRequest("empty task", { text: "say what the team should do" });
    const folder = this.library.folder(folderId);
    const running = get(this.hub.db, "SELECT id FROM folder_tasks WHERE folder_id = ? AND status = 'running'", folderId);
    if (running) throw conflict("task_running", "this folder's team is still on a task: wait for it, or cancel it");
    const { conversation, members } = this.room(folderId, folder.name);
    const lead = conversation.kind === "group" ? (conversation.leadBotId ?? members[0]!) : members[0]!;
    const name = (id: string) => this.hub.repos.bots.get(id)?.name ?? id;
    const others = members.filter((m) => m !== lead).map(name);
    // No @ in the task: only the lead wakes, and calls the others in itself.
    const message = [
      `📁 Task on the Library folder "${folder.name}" (${folder.id}):`,
      text,
      folder.description ? `About the folder: ${folder.description}` : null,
      `The folder holds ${folder.files} file(s): list them with library.list {"folder":"${folder.id}"} and copy one with library.get.`,
      others.length
        ? `${name(lead)} leads: split the work among ${others.join(", ")} with team.handoff, put together what they return, and give the final result here.`
        : `${name(lead)}: do it yourself and give the final result here.`,
      `Keep every file you make in the folder with library.save {"folder":"${folder.id}"}, and say how your part goes with task.progress.`,
    ]
      .filter(Boolean)
      .join("\n");
    const { item } = this.hub.conversationService.postUserMessage(conversation.id, { text: message });
    const id = newId("tsk");
    const at = this.now();
    exec(
      this.hub.db,
      "INSERT INTO folder_tasks (id, folder_id, text, conversation_id, lead_bot_id, chain_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)",
      id,
      folderId,
      text,
      conversation.id,
      lead,
      item.id,
      at,
    );
    for (const bot of members) exec(this.hub.db, "INSERT INTO task_steps (task_id, bot_id, status, updated_at) VALUES (?, ?, 'pending', ?)", id, bot, at);
    this.publish(id);
    // The lead's run may have ended already (a quick brain): settle it now.
    if (!this.chainActive(item.id)) this.settle(id);
    return this.task(id);
  }

  cancel(id: string): FolderTask {
    const task = this.task(id);
    if (task.status !== "running") throw conflict("task_ended", "this task already ended");
    const chain = (get<{ chain_id: string }>(this.hub.db, "SELECT chain_id FROM folder_tasks WHERE id = ?", id))!.chain_id;
    for (const run of this.hub.repos.runs.inChain(chain)) if (ACTIVE.includes(run.status)) this.hub.engine.cancel(run.id);
    this.finish(id, "cancelled", "");
    return this.task(id);
  }

  private step(taskId: string, botId: string, status: TaskStepStatus, note?: string): void {
    const at = this.now();
    const known = get(this.hub.db, "SELECT status FROM task_steps WHERE task_id = ? AND bot_id = ?", taskId, botId);
    if (!known) {
      // A bot called in from outside the room (a handoff to anyone) joins the board.
      exec(this.hub.db, "INSERT INTO task_steps (task_id, bot_id, status, note, updated_at) VALUES (?, ?, ?, ?, ?)", taskId, botId, status, note ?? "", at);
    } else if (note !== undefined) {
      exec(this.hub.db, "UPDATE task_steps SET status = ?, note = ?, updated_at = ? WHERE task_id = ? AND bot_id = ?", status, note.slice(0, 500), at, taskId, botId);
    } else {
      exec(this.hub.db, "UPDATE task_steps SET status = ?, updated_at = ? WHERE task_id = ? AND bot_id = ?", status, at, taskId, botId);
    }
  }

  private finish(id: string, status: FolderTaskStatus, result: string): void {
    exec(this.hub.db, "UPDATE folder_tasks SET status = ?, result = ?, ended_at = ? WHERE id = ? AND status = 'running'", status, result.slice(0, 20_000), this.now(), id);
    // Done: a step still under way is done with the task; a bot never called keeps "pending" (not needed).
    // Failed or cancelled: what was left undone failed.
    if (status === "done") exec(this.hub.db, "UPDATE task_steps SET status = 'done', updated_at = ? WHERE task_id = ? AND status = 'doing'", this.now(), id);
    else exec(this.hub.db, "UPDATE task_steps SET status = 'failed', updated_at = ? WHERE task_id = ? AND status IN ('pending', 'doing')", this.now(), id);
    this.publish(id);
  }

  /** When no run of the task's chain is left, it ended: with the lead's last answer as its result. */
  private settle(id: string): void {
    const row = get(this.hub.db, "SELECT * FROM folder_tasks WHERE id = ? AND status = 'running'", id);
    if (!row || this.chainActive(row.chain_id as string)) return;
    const runs = this.hub.repos.runs.inChain(row.chain_id as string);
    const leadRuns = runs.filter((r) => r.botId === row.lead_bot_id);
    const last = leadRuns.at(-1) ?? runs.at(-1);
    const answer = get<{ text: string }>(
      this.hub.db,
      "SELECT text FROM items WHERE conversation_id = ? AND kind = 'message' AND author_type = 'bot' AND author_id = ? AND created_at >= ? ORDER BY seq DESC LIMIT 1",
      row.conversation_id as string,
      row.lead_bot_id as string,
      row.created_at as string,
    );
    const ok = last?.status === "done";
    this.finish(id, ok ? "done" : "failed", answer?.text ?? (ok ? "" : (last?.error ?? "the team stopped")));
  }

  hooks(): RunHooks {
    return {
      onStarted: (run: Run) => {
        const task = this.runningByChain(run.chainId);
        if (!task) return;
        this.step(task.id as string, run.botId, "doing");
        this.publish(task.id as string);
      },
      onEnded: (run: Run) => {
        const task = this.runningByChain(run.chainId);
        if (!task) return;
        const id = task.id as string;
        const current = get<{ status: TaskStepStatus }>(this.hub.db, "SELECT status FROM task_steps WHERE task_id = ? AND bot_id = ?", id, run.botId);
        // A bot that said its part is done keeps it; otherwise its run says.
        if (current?.status !== "done" || run.status !== "done") this.step(id, run.botId, run.status === "done" ? "done" : "failed");
        this.publish(id);
        // Later runs of the chain (a report to the lead) are enqueued before this hook returns.
        setImmediate(() => this.settle(id));
      },
    };
  }

  tools(): ToolDefinition[] {
    return [
      {
        name: "task.progress",
        description:
          "Say how your part of the Library folder task goes, for the board the user follows: doing (with what you are on), done (with what you delivered) or failed (with why).",
        input: Type.Object({
          status: Type.Union([Type.Literal("doing"), Type.Literal("done"), Type.Literal("failed")]),
          note: Type.String({ maxLength: 500, description: "One short line" }),
        }),
        risk: "read",
        handler: async (input: { status: TaskStepStatus; note: string }, ctx) => {
          const task = this.runningByChain(ctx.run.chainId);
          if (!task) throw new HttpError(409, "no_task", "you are not working on a Library folder task right now");
          this.step(task.id as string, ctx.bot.id, input.status, input.note);
          this.publish(task.id as string);
          return "Noted on the task's board.";
        },
      },
    ];
  }

  /** The bots on a running task's board, for its context. */
  contextSection(bot: Bot): string | null {
    const row = get(
      this.hub.db,
      "SELECT t.* FROM folder_tasks t JOIN task_steps s ON s.task_id = t.id WHERE t.status = 'running' AND s.bot_id = ? ORDER BY t.created_at DESC LIMIT 1",
      bot.id,
    );
    if (!row) return null;
    return `You are on a Library folder task (folder ${row.folder_id as string}): keep what you make there with library.save and say how your part goes with task.progress.`;
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const IdParams = Type.Object({ id: Type.String() });
    app.get("/api/v1/library/folders/:id/tasks", { schema: { tags: ["library"], params: IdParams } }, async (req) => this.list(req.params.id));
    app.post(
      "/api/v1/library/folders/:id/tasks",
      { schema: { tags: ["library"], params: IdParams, body: Type.Object({ text: Type.String({ minLength: 1, maxLength: 20_000 }) }, { additionalProperties: false }) } },
      async (req, reply) => {
        reply.code(201);
        return this.begin(req.params.id, req.body.text);
      },
    );
    app.get("/api/v1/library/tasks/:id", { schema: { tags: ["library"], params: IdParams } }, async (req) => this.task(req.params.id));
    app.post("/api/v1/library/tasks/:id/cancel", { schema: { tags: ["library"], params: IdParams } }, async (req) => this.cancel(req.params.id));
  }
}
