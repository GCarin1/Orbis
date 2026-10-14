// specs/conversations — tasks given to a Library folder's team (change 0080-folder-tasks): the task goes to
// the team's conversation, the lead splits it with team.handoff, each bot's step shows on the board, what they
// keep goes to the folder as the task's, and the lead's last answer is the result.
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { FolderTask, LibraryFolder, LibraryPage, TimelineItem } from "@orbis/shared";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function folderWith(bots: string[], groups: string[] = []) {
  const folder = (await t!.api("POST", "/api/v1/library/folders", { name: "Evento", description: "Fotos da festa" })).body as LibraryFolder;
  await t!.api("PUT", `/api/v1/library/folders/${folder.id}/assignees`, { bots, groups });
  return folder;
}
const ended = async (id: string) => {
  await vi.waitFor(() => expect((t!.hub.folderTasks.task(id)).status).not.toBe("running"), { timeout: 10_000, interval: 20 });
  return t!.hub.folderTasks.task(id);
};

describe("a task on a Library folder", () => {
  it("goes to the team's own group, where the lead hands work out; steps, kept files and the result show on the board", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const folder = await folderWith([ana.id, bia.id]);
    writeFileSync(path.join(t.hub.computer.workDir(t.hub.botService.get(bia.id)), "legendas.md"), "# Legendas");
    const text = [
      `/tool task.progress {"status":"doing","note":"dividindo o trabalho"}`,
      `/tool team.handoff {"to":"bia","task":"/tool library.save {\\"path\\":\\"legendas.md\\",\\"folder\\":\\"${folder.id}\\"}\\n/reply legendas prontas"}`,
    ].join("\n");
    const res = await t.api("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text });
    expect(res.status).toBe(201);
    const started = res.body as FolderTask;
    expect(started).toMatchObject({ folderId: folder.id, status: "running", leadBotId: ana.id });
    expect(started.steps.map((s) => s.botId)).toEqual([ana.id, bia.id]);

    // The room: a group of the folder's bots, led by the first; the task is its message.
    const room = t.hub.conversationService.get(started.conversationId!);
    expect(room).toMatchObject({ kind: "group", title: "📁 Evento", leadBotId: ana.id });
    const first = (t.hub.conversationService.items(room.id, {}) as TimelineItem[]).find((i) => i.author.type === "user")!;
    expect(first.text).toMatch(/Task on the Library folder "Evento"/);
    expect(first.text).toMatch(/Ana leads: split the work among Bia with team\.handoff/);
    expect(first.mentions).toEqual([]);

    const done = await ended(started.id);
    expect(done.status).toBe("done");
    expect(done.steps).toEqual([
      expect.objectContaining({ botId: ana.id, status: "done" }),
      expect.objectContaining({ botId: bia.id, status: "done" }),
    ]);
    // What Bia kept is in the folder, as the task's; the result is Ana's last answer (her report).
    const files = ((await t.api("GET", `/api/v1/library?folder=${folder.id}`)).body as LibraryPage).files;
    expect(files.map((f) => [f.name, f.source])).toEqual([["legendas.md", "task"]]);
    expect(done.files).toEqual([files[0]!.id]);
    expect(done.result).toMatch(/legendas prontas/);
    expect(t.events.filter((e) => e.type === "folder.task").length).toBeGreaterThan(2);

    // The next task uses the same group again.
    const again = (await t.api("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text: "/reply ok" })).body as FolderTask;
    expect(again.conversationId).toBe(room.id);
    await ended(again.id);
    expect(((await t.api("GET", `/api/v1/library/folders/${folder.id}/tasks`)).body as FolderTask[]).map((x) => x.id)).toEqual([again.id, started.id]);
  });

  it("uses the folder's group, or one bot's own chat; refuses a folder with no team, a second task, an empty one", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const cris = await createBot(t, { name: "Cris" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Design", members: [bia.id, cris.id] })).body;
    const byGroup = await folderWith([ana.id], [group.id]);
    const task = (await t.api("POST", `/api/v1/library/folders/${byGroup.id}/tasks`, { text: "/reply feito" })).body as FolderTask;
    expect(task.conversationId).toBe(group.id);
    expect(task.steps.map((s) => s.botId)).toEqual([bia.id, cris.id]);
    expect((await ended(task.id)).result).toBe("feito");

    const alone = await folderWith([ana.id]);
    const solo = (await t.api("POST", `/api/v1/library/folders/${alone.id}/tasks`, { text: "/sleep 400\n/reply pronto" })).body as FolderTask;
    expect(solo.conversationId).toBe(t.hub.conversationService.directFor(ana.id).id);
    expect((await t.api("POST", `/api/v1/library/folders/${alone.id}/tasks`, { text: "outra" })).body.error.code).toBe("task_running");
    await ended(solo.id);

    const empty = (await t.api("POST", "/api/v1/library/folders", { name: "Vazia" })).body as LibraryFolder;
    expect((await t.api("POST", `/api/v1/library/folders/${empty.id}/tasks`, { text: "faça" })).body.error.code).toBe("no_team");
    expect((await t.api("POST", `/api/v1/library/folders/${alone.id}/tasks`, { text: "   " })).status).toBe(400);
  });

  it("is cancelled with its runs, fails when the lead fails, and task.progress needs a task", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const folder = await folderWith([ana.id]);
    const long = (await t.api("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text: "/sleep 5000" })).body as FolderTask;
    await vi.waitFor(() => expect(t!.hub.folderTasks.task(long.id).steps[0]!.status).toBe("doing"), { timeout: 5_000, interval: 20 });
    const cancelled = (await t.api("POST", `/api/v1/library/tasks/${long.id}/cancel`)).body as FolderTask;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.steps[0]!.status).toBe("failed");
    expect((await t.api("POST", `/api/v1/library/tasks/${long.id}/cancel`)).body.error.code).toBe("task_ended");

    const failing = (await t.api("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text: "/fail sem acesso" })).body as FolderTask;
    const failed = await ended(failing.id);
    expect(failed.status).toBe("failed");
    expect(failed.result).toMatch(/sem acesso/);

    const conv = t.hub.conversationService.directFor(ana.id);
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: `/tool task.progress {"status":"doing","note":"x"}` });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.steps.some((s) => s.type === "tool_result" && (s as { isError: boolean }).isError)).toBe(true);
  });
});
