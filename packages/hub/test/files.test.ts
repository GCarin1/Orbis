// specs/conversations — files in conversations (change 0059-files-conversations-sends-bots): the user
// uploads files and sends them with a message, the bots answering find them in their workspace and the
// text of small text files in their task, a bot sends a file it made, files are listed and served safely,
// and they go when the conversation is cleared or an upload is never sent.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConversationFile, Run, TimelineItem } from "@orbis/shared";
import { chat, createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

async function upload(conversationId: string, name: string, body: Buffer | string, type?: string) {
  const res = await t!.hub.app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversationId}/files`,
    headers: { authorization: `Bearer ${TOKEN}`, "x-file-name": encodeURIComponent(name), ...(type ? { "content-type": type } : {}) },
    payload: body,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as ConversationFile & { error?: { message: string; fields?: Record<string, string> } } };
}

const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result") as Array<{ output: string; isError: boolean }>;

describe("files sent by the user", () => {
  it("are kept, sent with a message, copied into the bot's workspace and named in its task", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Rita" });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    // A JSON file stays the bytes it is: the upload parses no body.
    const notes = await upload(conv.id, "notas da reunião.json", '{"meta": 3}', "application/json");
    expect(notes.status).toBe(201);
    expect(notes.body).toMatchObject({ name: "notas da reunião.json", mime: "application/json", size: 11, itemId: null, author: { type: "user", id: null } });
    const photo = await upload(conv.id, "../../foto.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]), "image/png");
    expect(photo.body.name).toBe("foto.png");

    // Sent with no text, as a chat app sends a photo.
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "", attachments: [notes.body.id, photo.body.id] });
    expect(posted.status).toBe(201);
    const item = posted.body.item as TimelineItem;
    expect(item.files!.map((f) => [f.name, f.itemId])).toEqual([
      ["notas da reunião.json", item.id],
      ["foto.png", item.id],
    ]);
    const [run] = await Promise.all(posted.body.runs.map((r: { id: string }) => t!.hub.engine.wait(r.id)));
    // The bot finds both in its workspace, and the JSON's text in its task, marked as data.
    const folder = path.join(t.hub.computer.workDir(t.hub.botService.get(bot.id)), "orbis-files");
    expect(readFileSync(path.join(folder, "notas da reunião.json"), "utf8")).toBe('{"meta": 3}');
    expect(existsSync(path.join(folder, "foto.png"))).toBe(true);
    expect(run!.input).toContain("orbis-files/notas da reunião.json");
    expect(run!.input).toContain("- foto.png (image, 8 B): orbis-files/foto.png");
    expect(run!.input).toMatch(/<untrusted-content source="file:notas da reunião.json">\n\{"meta": 3\}/);
    // The list of chats shows the files of a message without text.
    const more = (await upload(conv.id, "c.pdf", "%PDF")).body;
    t.hub.timeline.post({ conversationId: conv.id, kind: "message", author: { type: "user", id: null }, text: "", attachments: [more.id] });
    expect(t.hub.botService.get(bot.id).lastMessage?.text).toBe("📎 c.pdf");

    // Listed, newest first, and the history of later runs names them.
    const listed = await t.api("GET", `/api/v1/conversations/${conv.id}/files`);
    expect(listed.body.map((f: ConversationFile) => f.name).sort()).toEqual(["foto.png", "notas da reunião.json"]);
    // c.pdf was posted without being bound to its message: an upload not sent is not listed.
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body as TimelineItem[];
    expect(items[0]!.files).toHaveLength(2);
  });

  it("refuses a file of another conversation, one already sent, an empty or a too large one", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bia = await createBot(t, { name: "Bia" });
    const a = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    const b = (await t.api("GET", `/api/v1/bots/${bia.id}/conversation`)).body;
    const file = (await upload(a.id, "a.txt", "oi", "text/plain")).body;
    const elsewhere = await t.api("POST", `/api/v1/conversations/${b.id}/messages`, { text: "x", attachments: [file.id] });
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.body.error.fields.attachments).toMatch(/not a file uploaded to this conversation/);
    expect((await t.api("POST", `/api/v1/conversations/${a.id}/messages`, { text: "x", attachments: [file.id] })).status).toBe(201);
    const again = await t.api("POST", `/api/v1/conversations/${a.id}/messages`, { text: "x", attachments: [file.id] });
    expect(again.body.error.fields.attachments).toMatch(/already sent/);
    expect((await upload(a.id, "vazio.txt", "")).status).toBe(400);
    const big = await upload(a.id, "grande.bin", Buffer.alloc(25 * 1024 * 1024 + 1));
    expect([400, 413]).toContain(big.status);
    await t.hub.engine.idle();
  });
});

describe("serving a file", () => {
  it("shows images in place, downloads the rest, never runs a page, and takes the token in the address", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const png = (await upload(conv.id, "a.png", Buffer.from([1, 2, 3]), "image/png")).body;
    const page = (await upload(conv.id, "página.html", "<script>alert(1)</script>", "text/html")).body;

    const shown = await t.hub.app.inject({ method: "GET", url: `/api/v1/files/${png.id}/content?token=${TOKEN}` });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers["content-type"]).toBe("image/png");
    expect(shown.headers["content-disposition"]).toMatch(/^inline/);
    expect(shown.headers["content-security-policy"]).toMatch(/^sandbox/);
    expect(shown.headers["x-content-type-options"]).toBe("nosniff");

    const html = await t.hub.app.inject({ method: "GET", url: `/api/v1/files/${page.id}/content?token=${TOKEN}` });
    expect(html.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(html.headers["content-disposition"]).toBe(`attachment; filename="p_gina.html"; filename*=UTF-8''${encodeURIComponent("página.html")}`);

    const download = await t.hub.app.inject({ method: "GET", url: `/api/v1/files/${png.id}/content?download=1`, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(download.headers["content-disposition"]).toMatch(/^attachment/);
    expect(download.rawPayload).toEqual(Buffer.from([1, 2, 3]));

    expect((await t.hub.app.inject({ method: "GET", url: `/api/v1/files/${png.id}/content` })).statusCode).toBe(401);
    expect((await t.hub.app.inject({ method: "GET", url: `/api/v1/files/${png.id}/content?token=wrong` })).statusCode).toBe(401);
    // Only a file's content takes the token in the address.
    expect((await t.hub.app.inject({ method: "GET", url: `/api/v1/conversations/${conv.id}/files?token=${TOKEN}` })).statusCode).toBe(401);
  });
});

describe("files a bot sends", () => {
  it("sends a file of its workspace as its own message, lists the files and copies one back", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Rita" });
    const workspace = t.hub.computer.workDir(t.hub.botService.get(bot.id));
    writeFileSync(path.join(workspace, "relatorio.csv"), "mes,vendas\njan,10\n");
    const { runs, conversation } = await chat(t, bot.id, `/tool files.send {"path":"relatorio.csv","caption":"O relatório de vendas"}`);
    expect(results(runs[0]!)[0]).toMatchObject({ isError: false, output: expect.stringContaining("Sent relatorio.csv") });
    const items = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body as TimelineItem[];
    const sent = items.find((i) => i.files?.length)!;
    expect(sent).toMatchObject({ author: { type: "bot", id: bot.id }, text: "O relatório de vendas" });
    expect(sent.files![0]).toMatchObject({ name: "relatorio.csv", mime: "text/csv", author: { type: "bot", id: bot.id }, itemId: sent.id });

    // Outside its workspace, or a file that is not there: refused, nothing sent.
    const outside = await chat(t, bot.id, `/tool files.send {"path":"../../segredo.txt"}`);
    expect(results(outside.runs[0]!)[0]!.isError).toBe(true);
    const absent = await chat(t, bot.id, `/tool files.send {"path":"nada.pdf"}`);
    expect(results(absent.runs[0]!)[0]!.output).toMatch(/there is no file "nada.pdf"/);

    const listed = await chat(t, bot.id, "/tool files.list {}");
    expect(results(listed.runs[0]!)[0]!.output).toContain('"name": "relatorio.csv"');
    const got = await chat(t, bot.id, `/tool files.get {"file":"relatorio.csv"}`);
    expect(results(got.runs[0]!)[0]!.output).toContain("orbis-files/relatorio.csv");
    expect(results(got.runs[0]!)[0]!.output).toContain("jan,10");
  });
});

describe("files leaving with their conversation", () => {
  it("deletes the files of a cleared conversation and the uploads never sent", async () => {
    let now = new Date("2026-10-07T12:00:00Z");
    t = await testHub({ clock: () => now });
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const sent = (await upload(conv.id, "a.txt", "a")).body;
    await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "x", attachments: [sent.id] });
    await t.hub.engine.idle();
    const unsent = (await upload(conv.id, "b.txt", "b")).body;
    const stored = () => readdirSync(t!.hub.files.dir).sort();
    expect(stored()).toEqual([sent.id, unsent.id].sort());

    // A day later the upload never sent goes; the sent file stays.
    now = new Date("2026-10-09T12:00:00Z");
    t.hub.files.sweep();
    expect(stored()).toEqual([sent.id]);

    expect((await t.api("DELETE", `/api/v1/conversations/${conv.id}/items`)).status).toBe(200);
    t.hub.files.sweep();
    expect(stored()).toEqual([]);
    expect((await t.api("GET", `/api/v1/conversations/${conv.id}/files`)).body).toEqual([]);
  });
});
