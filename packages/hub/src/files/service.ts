// Files in conversations (specs/conversations, change 0059-files-conversations-sends-bots): the user sends
// files with a message and the bots answering it find them in their workspace; a bot sends the files it
// makes back to the conversation; every file stays with its conversation, listed and downloadable, until
// the conversation is cleared or deleted. The bytes live in <data>/files/<id>; the rows say what they are.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Author, Bot, ConversationFile, FileSource, Run, TimelineItem } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run as exec } from "../db/index.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId } from "../ids.js";
import { toFile } from "../repos/conversations.js";
import { confine } from "../computer/paths.js";
import { decodeText } from "../computer/tools.js";
import type { AttachmentHandler } from "../services/conversations.js";
import type { BrainImage } from "../brains/types.js";
import { untrusted, type ToolDefinition } from "../tools/registry.js";
import { DocumentReader, type ReadDocument } from "./documents.js";

/** The largest file a message may carry, sent by the user or by a bot. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** The most files one message may carry. */
export const MAX_FILES_PER_MESSAGE = 10;
/** The folder of a bot's workspace the files of its conversations are copied to. */
export const FILES_FOLDER = "orbis-files";
/** The images a brain that sees gets with a message (change 0081): the types the APIs take, a few, not too large. */
export const VISION_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 5;
/** A text file this small is also given to the bot in its task, for brains that cannot read files. */
const INLINE_TEXT_BYTES = 20_000;
/** An upload never sent is forgotten after this long. */
const UNSENT_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  py: "text/x-python",
  sql: "text/plain",
  log: "text/plain",
  ics: "text/calendar",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** A file's type from its name, when nothing better says it. */
export function typeOf(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

/** A name safe to show and to write in a workspace: no folders, no control characters, not empty. */
export function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return clean || "file";
}

/** What the type says the file is, for the text a bot reads. */
export function kindOf(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "PDF";
  if (isText(mime)) return "text";
  return "file";
}

/** Where a file a bot makes in this run comes from, for the Library (change 0079). */
export function sourceOf(run: Run): FileSource {
  if (run.trigger.type === "routine" || run.trigger.type === "webhook") return "routine";
  if (run.skill) return "skill";
  return "chat";
}

export function isText(mime: string): boolean {
  return mime.startsWith("text/") || ["application/json", "application/xml", "application/yaml"].includes(mime);
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 104.8576)) / 10} MB`;
}

/** Types a browser may show in place; anything else is downloaded, so no page of a file runs in the hub's origin. */
function shownInPlace(mime: string): boolean {
  return (/^image\/(png|jpeg|gif|webp|bmp)$/.test(mime) || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/pdf" || mime === "text/plain");
}

export class FilesService implements AttachmentHandler {
  readonly dir: string;
  private timer: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly hub: HubContext,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.dir = path.join(hub.config.dataDir, "files");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.documents = new DocumentReader(path.join(hub.config.dataDir, "documents"));
  }

  /** The PDFs read for the bots (change 0084). */
  readonly documents: DocumentReader;

  /** Forget leftovers now and every hour, and soon after a conversation is cleared or deleted. */
  start(): void {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), SWEEP_MS);
    this.timer.unref();
    this.unsubscribe = this.hub.bus.subscribe((event) => {
      if (event.type === "conversation.cleared") this.dropUnsent((event.data as { conversationId: string }).conversationId);
      if (event.type === "conversation.cleared" || event.type === "conversation.deleted" || event.type === "bot.deleted") this.sweepSoon();
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.pending) clearTimeout(this.pending);
    this.timer = this.pending = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private sweepSoon(): void {
    if (this.pending) return;
    // After the rows of a deleted bot or conversation are gone.
    this.pending = setTimeout(() => {
      this.pending = null;
      this.sweep();
    }, 500);
    this.pending.unref();
  }

  pathOf(id: string): string {
    if (!/^fil_[A-Za-z0-9_-]+$/.test(id)) throw badRequest("invalid file id", { id: "not a file id" });
    return path.join(this.dir, id);
  }

  /** Delete the bytes no row names (a cleared or deleted conversation's) and the uploads never sent. */
  sweep(): void {
    const before = new Date(this.clock().getTime() - UNSENT_MS).toISOString();
    // An upload to a conversation never sent; a file put in the Library alone has no message and stays.
    exec(this.hub.db, "DELETE FROM files WHERE item_id IS NULL AND conversation_id IS NOT NULL AND source = 'chat' AND created_at < ?", before);
    const known = new Set(all<{ id: string }>(this.hub.db, "SELECT id FROM files").map((r) => r.id));
    for (const name of readdirSync(this.dir)) {
      if (!known.has(name)) rmSync(path.join(this.dir, name), { force: true, recursive: true });
    }
    this.documents.sweep(known);
  }

  private dropUnsent(conversationId: string): void {
    exec(this.hub.db, "DELETE FROM files WHERE conversation_id = ? AND item_id IS NULL", conversationId);
  }

  get(id: string): ConversationFile | undefined {
    const row = get(this.hub.db, "SELECT * FROM files WHERE id = ?", id);
    return row ? toFile(row) : undefined;
  }

  /** The files sent in a conversation, newest first. */
  list(conversationId: string): ConversationFile[] {
    this.hub.conversationService.get(conversationId);
    return all(this.hub.db, "SELECT * FROM files WHERE conversation_id = ? AND item_id IS NOT NULL ORDER BY created_at DESC, rowid DESC", conversationId).map(toFile);
  }

  /**
   * Keep the bytes of a file for a conversation (sent when a message names it), or for the Library alone when
   * there is no conversation (change 0079).
   */
  store(
    conversationId: string | null,
    rawName: string,
    mime: string | undefined,
    bytes: Buffer,
    author: Author,
    extra: { folderId?: string | null; source?: FileSource } = {},
  ): ConversationFile {
    if (conversationId) this.hub.conversationService.get(conversationId);
    if (bytes.length === 0) throw badRequest("empty file", { body: "the file is empty" });
    if (bytes.length > MAX_FILE_BYTES) throw badRequest("file too large", { body: `a file may have at most ${sizeText(MAX_FILE_BYTES)}` });
    const name = safeName(rawName);
    const given = (mime ?? "").split(";")[0]!.trim().toLowerCase();
    const type = given && given !== "application/octet-stream" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(given) ? given : typeOf(name);
    const file: ConversationFile = {
      id: newId("fil"),
      conversationId,
      name,
      mime: type,
      size: bytes.length,
      author,
      itemId: null,
      createdAt: this.clock().toISOString(),
      folderId: extra.folderId ?? null,
      archivedAt: null,
      source: extra.source ?? (conversationId ? "chat" : "library"),
    };
    writeFileSync(this.pathOf(file.id), bytes, { mode: 0o600 });
    exec(
      this.hub.db,
      "INSERT INTO files (id, conversation_id, item_id, name, mime, size, author_type, author_id, created_at, folder_id, source) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
      file.id,
      conversationId,
      file.name,
      file.mime,
      file.size,
      author.type,
      author.id,
      file.createdAt,
      file.folderId ?? null,
      file.source!,
    );
    // A document the user sends is read now, so it is ready (or nearly) when a bot starts on the message.
    if (author.type === "user" && DocumentReader.reads(file.mime)) void this.documents.read(file.id, this.pathOf(file.id)).catch(() => undefined);
    return file;
  }

  bytes(file: ConversationFile): Buffer {
    const at = this.pathOf(file.id);
    if (!existsSync(at)) throw notFound(`the content of file ${file.id}`);
    return readFileSync(at);
  }

  // --- the user's messages (AttachmentHandler) -----------------------------------------------------

  check(conversationId: string, ids: string[]): void {
    if (ids.length > MAX_FILES_PER_MESSAGE) throw badRequest("too many files", { attachments: `a message carries at most ${MAX_FILES_PER_MESSAGE} files` });
    if (new Set(ids).size !== ids.length) throw badRequest("invalid attachments", { attachments: "a file is named twice" });
    for (const id of ids) {
      const file = /^fil_/.test(id) ? this.get(id) : undefined;
      if (!file || file.conversationId !== conversationId) throw badRequest("invalid attachments", { attachments: `${id} is not a file uploaded to this conversation` });
      if (file.itemId) throw badRequest("invalid attachments", { attachments: `${file.name} was already sent` });
    }
  }

  bind(itemId: string, ids: string[]): void {
    for (const id of ids) exec(this.hub.db, "UPDATE files SET item_id = ? WHERE id = ?", itemId, id);
  }

  note(bot: Bot, item: TimelineItem): string | null {
    const files = item.files ?? [];
    if (!files.length) return null;
    let copied: Array<{ file: ConversationFile; at: string }>;
    try {
      copied = this.copyToWorkspace(bot, files);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return `The user sent ${files.length} file(s) (${files.map((f) => f.name).join(", ")}), but they could not be put in your workspace: ${why}.`;
    }
    const lines = copied.map(({ file, at }) => `- ${file.name} (${kindOf(file.mime)}, ${sizeText(file.size)}): ${at}`);
    const texts = copied
      .filter(({ file }) => isText(file.mime) && file.size <= INLINE_TEXT_BYTES)
      .map(({ file }) => {
        const text = decodeText(this.bytes(file));
        return text === null ? null : untrusted(`file:${file.name}`, text);
      })
      .filter((text): text is string => text !== null);
    return [
      `Files the user sent with this message, copied into your workspace (relative to where you work):`,
      ...lines,
      texts.length ? `The text files' contents:\n${texts.join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Copy files into the bot's workspace, under orbis-files/; two files of one name keep both. */
  copyToWorkspace(bot: Bot, files: ConversationFile[]): Array<{ file: ConversationFile; at: string }> {
    const folder = path.join(this.hub.computer.workDir(bot), FILES_FOLDER);
    mkdirSync(folder, { recursive: true });
    return placements(files).map(({ file, at }) => {
      copyFileSync(this.pathOf(file.id), path.join(folder, path.basename(at)));
      return { file, at };
    });
  }

  // --- documents read for the bots (change 0084-document-reading) -------------------------------------------

  /**
   * Before a bot starts on a message with documents: wait for them to be read, put their text and page images
   * next to them in the bot's workspace, and say so — with the text — in its task.
   */
  async prepare(run: Run, bot: Bot): Promise<string | null> {
    if (run.trigger.type !== "message" || !run.trigger.ref) return null;
    const files = this.hub.repos.items.get(run.trigger.ref)?.files ?? [];
    const documents = placements(files).filter(({ file }) => DocumentReader.reads(file.mime));
    if (!documents.length) return null;
    const parts: string[] = [];
    for (const { file, at } of documents) parts.push(await this.readFor(bot, file, at));
    return [
      "What Orbis read in the documents of this message — use these instead of taking the PDF apart with scripts:",
      ...parts,
      "Open the page images with your file or image tool to see drawings, tables and scans as they are; the text has what is written on them.",
    ].join("\n");
  }

  /** Read a document, place what was read next to its copy at `at`, and describe it for the bot. */
  private async readFor(bot: Bot, file: ConversationFile, at: string): Promise<string> {
    const doc = await this.documents.read(file.id, this.pathOf(file.id));
    const base = at.replace(/\.pdf$/i, "");
    const root = this.hub.computer.workDir(bot);
    const from = this.documents.folderOf(file.id);
    if (doc.text) copyFileSync(path.join(from, "text.txt"), path.join(root, `${base}.txt`));
    if (doc.drawing) copyFileSync(path.join(from, "drawing.txt"), path.join(root, `${base}.drawing.txt`));
    if (doc.images.length) {
      const pages = path.join(root, `${base}.pages`);
      rmSync(pages, { recursive: true, force: true });
      mkdirSync(pages, { recursive: true });
      for (const image of doc.images) copyFileSync(path.join(from, image.name), path.join(pages, image.name));
    }
    return describeDocument(file, base, doc);
  }

  /** The page images of a message's documents already read, for brains that see. */
  private documentImages(files: ConversationFile[]): BrainImage[] {
    return files
      .filter((f) => DocumentReader.reads(f.mime))
      .flatMap((f) => {
        try {
          const doc = JSON.parse(readFileSync(path.join(this.documents.folderOf(f.id), "document.json"), "utf8")) as ReadDocument;
          return doc.images
            .filter((image) => !image.tile)
            .map((image) => ({ name: `${f.name} — page ${image.page}`, mime: "image/png", data: readFileSync(path.join(this.documents.folderOf(f.id), image.name)).toString("base64") }));
        } catch {
          return [];
        }
      });
  }

  // --- images for brains that see (change 0081-vision) ----------------------------------------------------

  /** The images of the message that started a run, as brains that see take them: a few, not too large. */
  imagesFor(run: Run): BrainImage[] {
    if (run.trigger.type !== "message" || !run.trigger.ref) return [];
    const files = this.hub.repos.items.get(run.trigger.ref)?.files ?? [];
    const images = files
      .filter((f) => VISION_TYPES.has(f.mime) && f.size <= MAX_IMAGE_BYTES)
      .map((f) => ({ name: f.name, mime: f.mime, data: this.bytes(f).toString("base64") }));
    // A document's pages, as images, after the photos (change 0084).
    return [...images, ...this.documentImages(files)].filter((image) => image.data.length <= (MAX_IMAGE_BYTES * 4) / 3).slice(0, MAX_IMAGES);
  }

  // --- the bots' tools -----------------------------------------------------------------------------

  private conversationOf(run: Run): string {
    if (!run.conversationId) throw conflict("no_conversation", "this run has no conversation to hold files");
    return run.conversationId;
  }

  /** A bot sends a file of its workspace to the conversation it works in, as a message of its own. */
  send(
    bot: Bot,
    run: Run,
    requested: string,
    caption = "",
    extra: { folderId?: string | null; source?: FileSource; name?: string } = {},
  ): { item: TimelineItem; file: ConversationFile } {
    const conversationId = this.conversationOf(run);
    const at = this.workspaceFile(bot, requested);
    const file = this.store(conversationId, extra.name ?? path.basename(at), undefined, readFileSync(at), { type: "bot", id: bot.id }, {
      folderId: extra.folderId ?? null,
      source: extra.source ?? sourceOf(run),
    });
    const item = this.hub.timeline.post({
      conversationId,
      kind: "message",
      author: { type: "bot", id: bot.id },
      text: caption.trim(),
      parentId: null,
      attachments: [file.id],
    });
    this.bind(item.id, [file.id]);
    return { item, file: { ...file, itemId: item.id } };
  }

  /** A file of a bot's workspace, confined to it and within the size limit. */
  workspaceFile(bot: Bot, requested: string): string {
    const root = this.hub.computer.workDir(bot);
    let at: string;
    try {
      at = confine(root, requested);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : String(err));
    }
    if (!existsSync(at) || !statSync(at).isFile()) throw badRequest(`there is no file "${requested}" in your workspace; computer.list_files shows what is there`);
    const size = statSync(at).size;
    if (size > MAX_FILE_BYTES) throw badRequest(`"${requested}" has ${sizeText(size)}; a file may have at most ${sizeText(MAX_FILE_BYTES)}`);
    return at;
  }

  /** A file of the conversation, by id or by name (the newest of that name). */
  private find(conversationId: string, ref: string): ConversationFile {
    const byId = /^fil_/.test(ref) ? this.get(ref) : undefined;
    if (byId && byId.conversationId === conversationId && byId.itemId) return byId;
    const byName = this.list(conversationId).find((f) => f.name === ref) ?? this.list(conversationId).find((f) => f.name.toLowerCase() === ref.toLowerCase());
    if (!byName) throw notFound(`a file "${ref}" in this conversation (files.list shows them)`);
    return byName;
  }

  tools(): ToolDefinition[] {
    const describe = (f: ConversationFile) => ({
      id: f.id,
      name: f.name,
      type: f.mime,
      size: sizeText(f.size),
      from: f.author.type === "user" ? "user" : f.author.type === "bot" ? `@${this.hub.repos.bots.get(f.author.id ?? "")?.handle ?? "a bot"}` : "Orbis",
      sentAt: f.createdAt,
    });
    return [
      {
        name: "files.list",
        description: "List the files sent in this conversation (by the user or by bots), newest first: id, name, type, size, who sent it and when.",
        input: Type.Object({}),
        risk: "read",
        handler: async (_input: unknown, ctx) => {
          const files = this.list(this.conversationOf(ctx.run));
          return files.length ? JSON.stringify(files.map(describe), null, 2) : "No files were sent in this conversation yet.";
        },
      },
      {
        name: "files.get",
        description: `Copy a file sent in this conversation into your workspace (${FILES_FOLDER}/) to read or work on it, by its id or its name. Returns where it is and, for a small text file, its text.`,
        input: Type.Object({ file: Type.String({ minLength: 1, description: "The file's id (fil_…) or its name" }) }),
        risk: "read",
        handler: async (input: { file: string }, ctx) => {
          const file = this.find(this.conversationOf(ctx.run), input.file);
          const [copied] = this.copyToWorkspace(ctx.bot, [file]);
          const text = isText(file.mime) && file.size <= INLINE_TEXT_BYTES ? decodeText(this.bytes(file)) : null;
          const where = `${file.name} (${kindOf(file.mime)}, ${sizeText(file.size)}) is in your workspace at ${copied!.at}`;
          if (DocumentReader.reads(file.mime)) return `${where}. What Orbis read in it:\n${await this.readFor(ctx.bot, file, copied!.at)}`;
          return text === null ? where : `${where}. Its text:\n${untrusted(`file:${file.name}`, text)}`;
        },
      },
      {
        name: "files.send",
        description:
          "Send a file you made (a report, a spreadsheet, an image, a PDF…) to this conversation, as a message the user can open and download. Give its path in your workspace and, optionally, a short caption. Files up to 25 MB.",
        input: Type.Object({
          path: Type.String({ minLength: 1, description: "The file's path in your workspace" }),
          caption: Type.Optional(Type.String({ maxLength: 2_000, description: "A short text sent with it" })),
        }),
        risk: "write",
        defaultDecision: "allow",
        handler: async (input: { path: string; caption?: string }, ctx) => {
          const { file } = this.send(ctx.bot, ctx.run, input.path, input.caption ?? "");
          return `Sent ${file.name} (${sizeText(file.size)}) to the conversation as ${file.id}. Do not paste its contents in your reply: the user has the file.`;
        },
      },
    ];
  }

  // --- routes --------------------------------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const IdParams = Type.Object({ id: Type.String() });

    // The upload takes the file as the request's body, whatever its type: its own parsers, its own limit.
    await root.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES }, (_req, body, done) => done(null, body));
      scope.withTypeProvider<TypeBoxTypeProvider>().post(
        "/api/v1/conversations/:id/files",
        { bodyLimit: MAX_FILE_BYTES, schema: { tags: ["conversations"], params: IdParams } },
        async (req, reply) => {
          const header = req.headers["x-file-name"];
          const raw = Array.isArray(header) ? header[0] : header;
          let name = "file";
          try {
            name = raw ? decodeURIComponent(raw) : "file";
          } catch {
            name = raw ?? "file";
          }
          const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
          reply.code(201);
          return this.store(req.params.id, name, req.headers["content-type"], body, { type: "user", id: null });
        },
      );
    });

    app.get("/api/v1/conversations/:id/files", { schema: { tags: ["conversations"], params: IdParams } }, async (req) => this.list(req.params.id));

    app.get(
      "/api/v1/files/:id/content",
      { schema: { tags: ["conversations"], params: IdParams, querystring: Type.Object({ download: Type.Optional(Type.String()), token: Type.Optional(Type.String()) }) } },
      async (req, reply) => {
        const file = this.get(req.params.id);
        if (!file) throw notFound(`file ${req.params.id}`);
        return this.serve(reply, file, req.query.download !== undefined && req.query.download !== "0");
      },
    );
  }

  private serve(reply: FastifyReply, file: ConversationFile, download: boolean) {
    const inline = !download && shownInPlace(file.mime);
    const encoded = encodeURIComponent(file.name);
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    reply
      .header("content-type", inline ? file.mime : file.mime.startsWith("text/") ? "text/plain; charset=utf-8" : "application/octet-stream")
      .header("content-disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`)
      .header("x-content-type-options", "nosniff")
      // A file never runs as a page of the hub's origin, whatever it holds.
      .header("content-security-policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'")
      .header("cache-control", "private, max-age=86400");
    return reply.send(this.bytes(file));
  }
}

/** Where each file goes in a bot's orbis-files/: its name, or with its id's end when two share a name. */
function placements(files: ConversationFile[]): Array<{ file: ConversationFile; at: string }> {
  const used = new Set<string>();
  return files.map((file) => {
    let name = file.name;
    if (used.has(name.toLowerCase())) {
      const ext = path.extname(name);
      name = `${name.slice(0, name.length - ext.length)}-${file.id.slice(-6)}${ext}`;
    }
    used.add(name.toLowerCase());
    return { file, at: `${FILES_FOLDER}/${name}` };
  });
}

/** A document's text given in the task at most; the rest is in its text file. */
const DOCUMENT_TEXT_CHARS = 20_000;
const SHEETS: Array<[string, number, number]> = [
  ["A0", 2384, 3370],
  ["A1", 1684, 2384],
  ["A2", 1191, 1684],
  ["A3", 842, 1191],
  ["A4", 595, 842],
];

/** A page size's paper name (A0…A4, either way round), when it is one. */
export function paperOf(size: { width: number; height: number } | null): string | null {
  if (!size) return null;
  const [short, long] = [Math.min(size.width, size.height), Math.max(size.width, size.height)];
  return SHEETS.find(([, w, h]) => Math.abs(short - w) / w < 0.03 && Math.abs(long - h) / h < 0.03)?.[0] ?? null;
}

/** What a bot is told of a document Orbis read: where its text and page images are, and the text itself. */
export function describeDocument(file: ConversationFile, base: string, doc: ReadDocument): string {
  const paper = paperOf(doc.size);
  const lines = [`- ${file.name}: ${doc.pages ? `${doc.pages} page${doc.pages === 1 ? "" : "s"}` : "a PDF"}${paper ? ` (${paper}${doc.size && doc.size.width > doc.size.height ? ", landscape" : ""})` : ""}.`];
  if (doc.text) lines.push(`  Text (${doc.words} words${doc.ocr ? ", read by OCR from the page images" : ""}): ${base}.txt`);
  const pages = doc.images.filter((i) => !i.tile);
  if (pages.length) {
    lines.push(`  Page images: ${base}.pages/${pages[0]!.name}${pages.length > 1 ? ` … ${pages[pages.length - 1]!.name}` : ""} (whole pages).`);
    for (const [page, grid] of Object.entries(doc.grids)) {
      lines.push(
        `  Page ${page} is a big sheet, also cut into ${grid.rows} rows × ${grid.cols} columns of tiles for its details: ${base}.pages/page-${page}-r1c1.png … page-${page}-r${grid.rows}c${grid.cols}.png (r = row from the top, c = column from the left).`,
      );
    }
  }
  if (doc.drawing) {
    lines.push(`  The sheet's lettering read by OCR from the tiles (tables, room names, dimensions; it may have mistakes — check them in the images): ${base}.drawing.txt`);
  }
  if (doc.problem) lines.push(`  Note: ${doc.problem}.`);
  // The text first, then the lettering, within one budget; what does not fit stays in the files.
  let budget = DOCUMENT_TEXT_CHARS;
  for (const [what, text, at] of [["Its text", doc.text, `${base}.txt`], ["The sheet's lettering (OCR)", doc.drawing, `${base}.drawing.txt`]] as const) {
    if (!text || budget <= 0) continue;
    const cut = text.length > budget;
    lines.push(`  ${what}${cut ? ` (the first ${budget} characters; all of it is in ${at})` : ""}:`, untrusted(`file:${file.name}`, cut ? text.slice(0, budget) : text));
    budget -= Math.min(text.length, budget);
  }
  return lines.join("\n");
}
