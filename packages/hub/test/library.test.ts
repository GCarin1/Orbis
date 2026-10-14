// specs/conversations — the Library (change 0079-library, ADR 0030): every file Orbis keeps, from every
// conversation and put in directly; deleting it removes it everywhere, archiving only hides it; a file is
// forwarded to a bot; folders that bots and groups work on, with their tools; and how much space it takes.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConversationFile, LibraryFile, LibraryFolder, LibraryPage, LibraryUsage, Run, TimelineItem } from "@orbis/shared";
import { chat, createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function raw(url: string, name: string, body: Buffer | string, headers: Record<string, string> = {}) {
  const res = await t!.hub.app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${TOKEN}`, "x-file-name": encodeURIComponent(name), ...headers },
    payload: body,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as LibraryFile & { error?: { code: string } } };
}
const toLibrary = (name: string, body: Buffer | string, headers: Record<string, string> = {}) => raw("/api/v1/library/files", name, body, headers);
const library = async (query = "") => (await t!.api("GET", `/api/v1/library${query}`)).body as LibraryPage;
const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result") as Array<{ output: string; isError: boolean }>;

/** A file sent in a bot's conversation, by the user. */
async function sent(botId: string, name: string, body: string, type: string) {
  const conv = (await t!.api("GET", `/api/v1/bots/${botId}/conversation`)).body;
  const up = await raw(`/api/v1/conversations/${conv.id}/files`, name, body, { "content-type": type });
  const posted = await t!.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "", attachments: [up.body.id] });
  await Promise.all(posted.body.runs.map((r: { id: string }) => t!.hub.engine.wait(r.id)));
  return { conversationId: conv.id as string, file: up.body, item: posted.body.item as TimelineItem };
}

describe("the Library", () => {
  it("lists the files of every conversation and the ones put in it, by kind, name and page — never an upload not sent", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const { file: photo } = await sent(ana.id, "praia.png", "png!", "image/png");
    const direct = await toLibrary("contrato.pdf", "%PDF-1", { "content-type": "application/pdf" });
    expect(direct.status).toBe(201);
    expect(direct.body).toMatchObject({ name: "contrato.pdf", conversationId: null, itemId: null, source: "library", conversationTitle: null });
    const conv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    await raw(`/api/v1/conversations/${conv.id}/files`, "rascunho.txt", "não enviado", { "content-type": "text/plain" });

    const everything = await library();
    expect(everything.files.map((f) => f.name)).toEqual(["contrato.pdf", "praia.png"]);
    expect(everything.files[1]).toMatchObject({ id: photo.id, source: "chat", conversationTitle: "Ana" });
    expect((await library("?kind=image")).files.map((f) => f.name)).toEqual(["praia.png"]);
    expect((await library("?kind=doc")).files.map((f) => f.name)).toEqual(["contrato.pdf"]);
    expect((await library("?q=PRAI")).files.map((f) => f.name)).toEqual(["praia.png"]);
    const first = await library("?limit=1");
    expect(first.files).toHaveLength(1);
    expect((await library(`?limit=1&cursor=${encodeURIComponent(first.next!)}`)).files.map((f) => f.name)).toEqual(["praia.png"]);

    // A file put in the Library alone is never swept as an upload not sent.
    t.hub.files.sweep();
    expect(existsSync(path.join(t.hub.files.dir, direct.body.id))).toBe(true);
  });

  it("deletes a file everywhere, archives one away from its lists, and does both in batches", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const { file, conversationId, item } = await sent(ana.id, "nota.txt", "oi", "text/plain");
    const b = (await toLibrary("b.txt", "b")).body;
    const c = (await toLibrary("c.txt", "c")).body;

    expect((await t.api("PATCH", `/api/v1/library/files/${b.id}`, { archived: true })).body.archivedAt).toBeTruthy();
    expect((await library()).files.map((f) => f.name)).toEqual(["c.txt", "nota.txt"]);
    expect((await library("?archived=true")).files.map((f) => f.name)).toEqual(["b.txt"]);
    expect((await t.api("PATCH", `/api/v1/library/files/${c.id}`, { name: "../renomeado.txt" })).body.name).toBe("renomeado.txt");

    // Deleted: gone from the Library, its bytes and the message, which stays.
    expect((await t.api("DELETE", `/api/v1/library/files/${file.id}`)).status).toBe(204);
    expect(existsSync(path.join(t.hub.files.dir, file.id))).toBe(false);
    const after = ((await t.api("GET", `/api/v1/conversations/${conversationId}/items`)).body as TimelineItem[]).find((i) => i.id === item.id)!;
    expect(after.attachments).toEqual([file.id]);
    expect(after.files).toEqual([]);
    expect(t.events.some((e) => e.type === "library.updated")).toBe(true);

    const batch = await t.api("POST", "/api/v1/library/batch", { ids: [b.id, c.id], action: "delete" });
    expect(batch.body).toEqual({ deleted: 2 });
    expect((await library()).files).toEqual([]);
    expect((await t.api("DELETE", `/api/v1/library/files/${b.id}`)).status).toBe(404);
  });

  it("forwards files to a bot, which wakes with them in its workspace", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const photo = (await toLibrary("gato.png", "png!", { "content-type": "image/png" })).body;
    const res = await t.api("POST", `/api/v1/library/files/${photo.id}/forward`, { botId: ana.id, text: "Descreva" });
    expect(res.status).toBe(201);
    const item = res.body.item as TimelineItem;
    expect(item.text).toBe("Descreva");
    expect(item.files!.map((f) => f.name)).toEqual(["gato.png"]);
    // A copy: the original stays in the Library, the copy belongs to the conversation.
    expect(item.files![0]!.id).not.toBe(photo.id);
    const [run] = t.hub.repos.runs.list({ conversationId: res.body.conversationId });
    await t.hub.engine.wait(run!.id);
    const folder = path.join(t.hub.computer.workDir(t.hub.botService.get(ana.id)), "orbis-files");
    expect(readFileSync(path.join(folder, "gato.png"), "utf8")).toBe("png!");
    expect((await library()).files.map((f) => f.name)).toEqual(["gato.png", "gato.png"]);
    expect((await t.api("POST", `/api/v1/library/files/${photo.id}/forward`, {})).status).toBe(400);
  });

  it("keeps folders: files moved in and out, who works on them, and deleting one with or without its files", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Design", members: [ana.id, bia.id] })).body;
    const created = await t.api("POST", "/api/v1/library/folders", { name: "Fotos do evento", description: "Escolher as melhores" });
    expect(created.status).toBe(201);
    const folder = created.body as LibraryFolder;
    const inside = (await toLibrary("a.png", "a", { "content-type": "image/png", "x-folder-id": folder.id })).body;
    const outside = (await toLibrary("b.png", "b", { "content-type": "image/png" })).body;
    expect(inside.folderId).toBe(folder.id);
    await t.api("POST", "/api/v1/library/batch", { ids: [outside.id], action: "move", folderId: folder.id });
    expect((await library(`?folder=${folder.id}`)).files.map((f) => f.name).sort()).toEqual(["a.png", "b.png"]);
    expect(((await t.api("GET", "/api/v1/library/folders")).body as LibraryFolder[])[0]).toMatchObject({ name: "Fotos do evento", files: 2, bytes: 2 });

    const assigned = await t.api("PUT", `/api/v1/library/folders/${folder.id}/assignees`, { bots: [ana.id], groups: [group.id] });
    expect(assigned.body).toMatchObject({ bots: [ana.id], groups: [group.id] });
    const direct = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    expect((await t.api("PUT", `/api/v1/library/folders/${folder.id}/assignees`, { bots: [], groups: [direct.id] })).status).toBe(400);

    // Deleted without its files: they leave the folder. With them: they go.
    const other = (await t.api("POST", "/api/v1/library/folders", { name: "Outra" })).body as LibraryFolder;
    await t.api("POST", "/api/v1/library/batch", { ids: [outside.id], action: "move", folderId: other.id });
    expect((await t.api("DELETE", `/api/v1/library/folders/${other.id}`)).status).toBe(204);
    expect(t.hub.library.file(outside.id).folderId).toBeNull();
    expect((await t.api("DELETE", `/api/v1/library/folders/${folder.id}?withFiles=true`)).status).toBe(204);
    expect((await library()).files.map((f) => f.name)).toEqual(["b.png"]);
  });

  it("lets a bot list, copy and keep files only in the folders it works on — directly or through a group", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const cris = await createBot(t, { name: "Cris" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Design", members: [bia.id, cris.id] })).body;
    const mine = (await t.api("POST", "/api/v1/library/folders", { name: "Relatórios" })).body as LibraryFolder;
    const secret = (await t.api("POST", "/api/v1/library/folders", { name: "Privada" })).body as LibraryFolder;
    await t.api("PUT", `/api/v1/library/folders/${mine.id}/assignees`, { bots: [ana.id], groups: [group.id] });
    const data = (await toLibrary("dados.csv", "a,b\n1,2", { "content-type": "text/csv", "x-folder-id": mine.id })).body;
    const hidden = (await toLibrary("x.txt", "x", { "x-folder-id": secret.id })).body;

    const listed = await chat(t, ana.id, "/tool library.list {}");
    expect(results(listed.runs[0]!)[0]!.output).toContain("Relatórios");
    expect(results(listed.runs[0]!)[0]!.output).not.toContain("Privada");
    // Through the group: Cris works on it too.
    const files = await chat(t, cris.id, `/tool library.list {"folder":"relatórios"}`);
    expect(results(files.runs[0]!)[0]!.output).toContain("dados.csv");
    const got = await chat(t, cris.id, `/tool library.get {"file":"${data.id}"}`);
    expect(results(got.runs[0]!)[0]!.output).toMatch(/orbis-files\/dados\.csv[\s\S]*a,b/);
    const refused = await chat(t, ana.id, `/tool library.get {"file":"${hidden.id}"}`);
    expect(results(refused.runs[0]!)[0]!.isError).toBe(true);
    expect((await chat(t, ana.id, `/tool library.list {"folder":"Privada"}`)).runs[0]!.steps.some((s) => s.type === "tool_result" && (s as { isError: boolean }).isError)).toBe(true);

    // Kept in the folder, and sent to the conversation the bot works in.
    writeFileSync(path.join(t.hub.computer.workDir(t.hub.botService.get(ana.id)), "resumo.md"), "# Resumo");
    const saved = await chat(t, ana.id, `/tool library.save {"path":"resumo.md","folder":"Relatórios","caption":"Pronto"}`);
    expect(results(saved.runs[0]!)[0]!.output).toMatch(/Kept resumo\.md .* folder "Relatórios"/);
    const kept = (await library(`?folder=${mine.id}`)).files.find((f) => f.name === "resumo.md")!;
    expect(kept).toMatchObject({ source: "chat", author: { type: "bot", id: ana.id }, conversationId: saved.conversation.id });
    expect(((await t.api("GET", `/api/v1/conversations/${saved.conversation.id}/files`)).body as ConversationFile[]).map((f) => f.name)).toContain("resumo.md");
    const outsider = await chat(t, ana.id, `/tool library.save {"path":"resumo.md","folder":"Privada"}`);
    expect(results(outsider.runs[0]!)[0]!.isError).toBe(true);
  });

  it("travels in an export: folders, who works on them, and their files", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const folder = (await t.api("POST", "/api/v1/library/folders", { name: "Fotos" })).body as LibraryFolder;
    await t.api("PUT", `/api/v1/library/folders/${folder.id}/assignees`, { bots: [ana.id], groups: [] });
    const photo = (await toLibrary("a.png", "png!", { "content-type": "image/png", "x-folder-id": folder.id })).body;
    const zip = (await t.hub.app.inject({ method: "POST", url: "/api/v1/export", headers: { authorization: `Bearer ${TOKEN}` }, payload: {} })).rawPayload;
    const fresh = await testHub();
    try {
      const res = await fresh.hub.app.inject({ method: "POST", url: "/api/v1/import", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/octet-stream" }, payload: zip });
      expect(res.statusCode).toBe(200);
      const folders = (await fresh.api("GET", "/api/v1/library/folders")).body as LibraryFolder[];
      expect(folders).toEqual([expect.objectContaining({ id: folder.id, name: "Fotos", bots: [ana.id], files: 1 })]);
      const got = fresh.hub.library.file(photo.id);
      expect(got).toMatchObject({ folderId: folder.id, source: "library", conversationId: null });
      expect(fresh.hub.files.bytes(got).toString()).toBe("png!");
    } finally {
      await fresh.cleanup();
    }
  });

  it("says how much space the files take, by kind, and the largest", async () => {
    t = await testHub();
    await toLibrary("grande.mp4", Buffer.alloc(5000), { "content-type": "video/mp4" });
    await toLibrary("foto.jpg", Buffer.alloc(300), { "content-type": "image/jpeg" });
    await toLibrary("nota.txt", "abc");
    const usage = (await t.api("GET", "/api/v1/library/usage")).body as LibraryUsage;
    expect(usage).toMatchObject({ total: 5303, files: 3, byKind: { video: 5000, image: 300, audio: 0, doc: 3 } });
    expect(usage.largest.map((f) => f.name)).toEqual(["grande.mp4", "foto.jpg", "nota.txt"]);
    expect(usage.disk === null || usage.disk.size > 0).toBe(true);
  });
});
