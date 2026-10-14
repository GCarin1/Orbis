// The Library (specs/conversations, change 0079-library, ADR 0030): every file Orbis keeps, whatever
// conversation it was sent in, and the files put in it directly; folders that bots and groups work on; and
// how much space it all takes. It is the `files` table seen whole: deleting a file here deletes it everywhere,
// archiving only hides it from the Library's lists.
import { readFileSync, rmSync, statfsSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, ConversationFile, LibraryFile, LibraryFolder, LibraryPage, LibraryUsage, Run, TimelineItem } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { all, get, run as exec, type Row } from "../db/index.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import type { FilesService } from "../files/service.js";
import { isText, kindOf, MAX_FILE_BYTES, safeName, sizeText, sourceOf } from "../files/service.js";
import { decodeText } from "../computer/tools.js";
import { newId } from "../ids.js";
import { toFile } from "../repos/conversations.js";
import { untrusted, type ToolDefinition } from "../tools/registry.js";

export const LIBRARY_PAGE = 60;
export const MAX_FOLDERS = 200;
export const MAX_BATCH = 200;
const INLINE_TEXT_BYTES = 20_000;

export type FileKind = "image" | "video" | "audio" | "doc";

const KIND_SQL: Record<FileKind, string> = {
  image: "f.mime LIKE 'image/%'",
  video: "f.mime LIKE 'video/%'",
  audio: "f.mime LIKE 'audio/%'",
  doc: "f.mime NOT LIKE 'image/%' AND f.mime NOT LIKE 'video/%' AND f.mime NOT LIKE 'audio/%'",
};

/** A file the Library shows: sent in a conversation, or put in the Library alone (never an upload not yet sent). */
const SHOWN = "(f.item_id IS NOT NULL OR f.conversation_id IS NULL)";

export interface LibraryQuery {
  kind?: FileKind;
  q?: string;
  folder?: string;
  archived?: boolean;
  cursor?: string;
  limit?: number;
}

export class LibraryService {
  constructor(
    private readonly hub: HubContext,
    private readonly files: FilesService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private toLibraryFile(r: Row): LibraryFile {
    return { ...toFile(r), conversationTitle: (r.conversation_title as string | null) ?? null };
  }

  private changed(fileIds: string[], folderId: string | null = null): void {
    this.hub.bus.publish("library.updated", { fileIds, folderId });
  }

  // --- files -----------------------------------------------------------------------------------------

  list(query: LibraryQuery = {}): LibraryPage {
    const where = [SHOWN, query.archived ? "f.archived_at IS NOT NULL" : "f.archived_at IS NULL"];
    const args: Array<string | number> = [];
    if (query.kind) where.push(KIND_SQL[query.kind]);
    if (query.folder) {
      this.folderRow(query.folder);
      where.push("f.folder_id = ?");
      args.push(query.folder);
    }
    if (query.q?.trim()) {
      where.push("f.name LIKE ? ESCAPE '\\'");
      args.push(`%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (query.cursor) {
      const [at, id] = query.cursor.split("|");
      if (!at || !id) throw badRequest("invalid cursor", { cursor: "pass back the `next` of a page" });
      where.push("(f.created_at < ? OR (f.created_at = ? AND f.id < ?))");
      args.push(at, at, id);
    }
    const limit = Math.min(Math.max(query.limit ?? LIBRARY_PAGE, 1), 200);
    const rows = all(
      this.hub.db,
      `SELECT f.*, c.title AS conversation_title FROM files f LEFT JOIN conversations c ON c.id = f.conversation_id
       WHERE ${where.join(" AND ")} ORDER BY f.created_at DESC, f.id DESC LIMIT ?`,
      ...args,
      limit + 1,
    );
    const page = rows.slice(0, limit).map((r) => this.toLibraryFile(r));
    const last = page.at(-1);
    return { files: page, next: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null };
  }

  file(id: string): LibraryFile {
    const row = /^fil_/.test(id)
      ? get(this.hub.db, `SELECT f.*, c.title AS conversation_title FROM files f LEFT JOIN conversations c ON c.id = f.conversation_id WHERE f.id = ? AND ${SHOWN}`, id)
      : undefined;
    if (!row) throw notFound(`file ${id}`);
    return this.toLibraryFile(row);
  }

  /** Put a file in the Library directly (the Library screen's upload), optionally in a folder. */
  upload(rawName: string, mime: string | undefined, bytes: Buffer, folderId: string | null): LibraryFile {
    if (folderId) this.folderRow(folderId);
    const file = this.files.store(null, rawName, mime, bytes, { type: "user", id: null }, { folderId, source: "library" });
    this.touchFolder(folderId);
    this.changed([file.id], folderId);
    return this.file(file.id);
  }

  /** Delete a file everywhere: its bytes, its row, and from the message that carried it. */
  delete(ids: string[]): number {
    const files = ids.map((id) => this.file(id));
    for (const file of files) {
      exec(this.hub.db, "DELETE FROM files WHERE id = ?", file.id);
      rmSync(this.files.pathOf(file.id), { force: true });
      this.touchFolder(file.folderId ?? null);
      // The message stays and shows the file as deleted.
      if (file.itemId && file.conversationId) {
        const item = this.hub.repos.items.get(file.itemId);
        if (item) this.hub.bus.publish("timeline.item", { conversationId: file.conversationId, item });
      }
    }
    if (files.length) this.changed(files.map((f) => f.id));
    return files.length;
  }

  update(ids: string[], patch: { archived?: boolean; folderId?: string | null; name?: string }): LibraryFile[] {
    if (patch.folderId) this.folderRow(patch.folderId);
    if (patch.name !== undefined && ids.length !== 1) throw badRequest("invalid rename", { name: "rename one file at a time" });
    const files = ids.map((id) => this.file(id));
    for (const file of files) {
      if (patch.archived !== undefined) exec(this.hub.db, "UPDATE files SET archived_at = ? WHERE id = ?", patch.archived ? this.clock().toISOString() : null, file.id);
      if (patch.folderId !== undefined) {
        exec(this.hub.db, "UPDATE files SET folder_id = ? WHERE id = ?", patch.folderId, file.id);
        this.touchFolder(file.folderId ?? null);
        this.touchFolder(patch.folderId);
      }
      if (patch.name !== undefined) exec(this.hub.db, "UPDATE files SET name = ? WHERE id = ?", safeName(patch.name), file.id);
    }
    this.changed(files.map((f) => f.id), patch.folderId ?? null);
    return files.map((f) => this.file(f.id));
  }

  /**
   * Send a copy of Library files to a bot (its direct conversation) or a conversation, as the user's message:
   * the bot, or the group's lead, wakes and finds them in its workspace.
   */
  forward(ids: string[], to: { botId?: string; conversationId?: string }, text = ""): { conversationId: string; item: TimelineItem; runs: Run[] } {
    if (!ids.length) throw badRequest("nothing to forward", { ids: "name at least one file" });
    if (ids.length > 10) throw badRequest("too many files", { ids: "forward at most 10 files at a time" });
    const conversationId = to.conversationId
      ? this.hub.conversationService.get(to.conversationId).id
      : to.botId
        ? this.hub.conversationService.directFor(to.botId).id
        : null;
    if (!conversationId) throw badRequest("no destination", { to: "name a bot or a conversation" });
    const copies = ids.map((id) => {
      const file = this.file(id);
      return this.files.store(conversationId, file.name, file.mime, this.files.bytes(file), { type: "user", id: null });
    });
    const sent = this.hub.conversationService.postUserMessage(conversationId, { text, attachments: copies.map((c) => c.id) });
    this.changed(copies.map((c) => c.id));
    return { conversationId, ...sent };
  }

  usage(): LibraryUsage {
    const byKind: LibraryUsage["byKind"] = { image: 0, video: 0, audio: 0, doc: 0 };
    let total = 0;
    let count = 0;
    for (const r of all<{ mime: string; size: number }>(this.hub.db, "SELECT mime, size FROM files")) {
      const kind = r.mime.startsWith("image/") ? "image" : r.mime.startsWith("video/") ? "video" : r.mime.startsWith("audio/") ? "audio" : "doc";
      byKind[kind] += Number(r.size);
      total += Number(r.size);
      count += 1;
    }
    const largest = all(
      this.hub.db,
      `SELECT f.*, c.title AS conversation_title FROM files f LEFT JOIN conversations c ON c.id = f.conversation_id WHERE ${SHOWN} ORDER BY f.size DESC LIMIT 20`,
    ).map((r) => this.toLibraryFile(r));
    let disk: LibraryUsage["disk"] = null;
    try {
      const s = statfsSync(this.hub.config.dataDir);
      disk = { free: Number(s.bavail) * Number(s.bsize), size: Number(s.blocks) * Number(s.bsize) };
    } catch {
      disk = null;
    }
    return { total, files: count, byKind, largest, disk };
  }

  // --- folders ---------------------------------------------------------------------------------------

  private folderRow(id: string): Row {
    const row = get(this.hub.db, "SELECT * FROM library_folders WHERE id = ?", id);
    if (!row) throw notFound(`folder ${id}`);
    return row;
  }

  private touchFolder(id: string | null): void {
    if (id) exec(this.hub.db, "UPDATE library_folders SET updated_at = ? WHERE id = ?", this.clock().toISOString(), id);
  }

  private toFolder(r: Row): LibraryFolder {
    const id = r.id as string;
    const stats = get<{ n: number; bytes: number | null }>(this.hub.db, "SELECT COUNT(*) AS n, SUM(size) AS bytes FROM files WHERE folder_id = ? AND archived_at IS NULL", id);
    return {
      id,
      name: r.name as string,
      description: r.description as string,
      bots: all<{ bot_id: string }>(this.hub.db, "SELECT bot_id FROM folder_bots WHERE folder_id = ? ORDER BY rowid", id).map((b) => b.bot_id),
      groups: all<{ conversation_id: string }>(this.hub.db, "SELECT conversation_id FROM folder_groups WHERE folder_id = ? ORDER BY rowid", id).map((g) => g.conversation_id),
      files: Number(stats?.n ?? 0),
      bytes: Number(stats?.bytes ?? 0),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  folders(): LibraryFolder[] {
    return all(this.hub.db, "SELECT * FROM library_folders ORDER BY updated_at DESC, id DESC").map((r) => this.toFolder(r));
  }

  folder(id: string): LibraryFolder {
    return this.toFolder(this.folderRow(id));
  }

  createFolder(input: { name: string; description?: string }): LibraryFolder {
    const name = input.name.trim();
    if (!name) throw badRequest("invalid folder", { name: "must not be empty" });
    const count = get<{ n: number }>(this.hub.db, "SELECT COUNT(*) AS n FROM library_folders")!.n;
    if (count >= MAX_FOLDERS) throw new HttpError(409, "too_many_folders", `the Library keeps at most ${MAX_FOLDERS} folders`);
    const at = this.clock().toISOString();
    const id = newId("fld");
    exec(this.hub.db, "INSERT INTO library_folders (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", id, name.slice(0, 120), (input.description ?? "").trim().slice(0, 2000), at, at);
    this.changed([], id);
    return this.folder(id);
  }

  updateFolder(id: string, patch: { name?: string; description?: string }): LibraryFolder {
    this.folderRow(id);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw badRequest("invalid folder", { name: "must not be empty" });
      exec(this.hub.db, "UPDATE library_folders SET name = ? WHERE id = ?", patch.name.trim().slice(0, 120), id);
    }
    if (patch.description !== undefined) exec(this.hub.db, "UPDATE library_folders SET description = ? WHERE id = ?", patch.description.trim().slice(0, 2000), id);
    this.touchFolder(id);
    this.changed([], id);
    return this.folder(id);
  }

  /** Delete a folder: its files leave it, or are deleted with it. */
  deleteFolder(id: string, withFiles = false): void {
    this.folderRow(id);
    const ids = all<{ id: string }>(this.hub.db, "SELECT id FROM files WHERE folder_id = ?", id).map((r) => r.id);
    if (withFiles) this.delete(ids.filter((f) => get(this.hub.db, `SELECT 1 AS x FROM files f WHERE f.id = ? AND ${SHOWN}`, f)));
    exec(this.hub.db, "DELETE FROM library_folders WHERE id = ?", id);
    this.changed(ids, id);
  }

  /** Who works on a folder: bots, and groups (every member of each). */
  assign(id: string, input: { bots: string[]; groups: string[] }): LibraryFolder {
    this.folderRow(id);
    const bots = [...new Set(input.bots.map((b) => this.hub.botService.get(b).id))];
    const groups = [...new Set(input.groups)].map((g) => {
      const conversation = this.hub.conversationService.get(g);
      if (conversation.kind !== "group") throw badRequest("invalid assignees", { groups: `${conversation.title} is not a group` });
      return conversation.id;
    });
    exec(this.hub.db, "DELETE FROM folder_bots WHERE folder_id = ?", id);
    exec(this.hub.db, "DELETE FROM folder_groups WHERE folder_id = ?", id);
    for (const b of bots) exec(this.hub.db, "INSERT INTO folder_bots (folder_id, bot_id) VALUES (?, ?)", id, b);
    for (const g of groups) exec(this.hub.db, "INSERT INTO folder_groups (folder_id, conversation_id) VALUES (?, ?)", id, g);
    this.touchFolder(id);
    this.changed([], id);
    return this.folder(id);
  }

  /** The folders a bot works on: given to it, or to a group it is a member of. */
  foldersOf(bot: Bot): LibraryFolder[] {
    return all(
      this.hub.db,
      `SELECT DISTINCT l.* FROM library_folders l
       LEFT JOIN folder_bots b ON b.folder_id = l.id
       LEFT JOIN folder_groups g ON g.folder_id = l.id
       LEFT JOIN conversation_members m ON m.conversation_id = g.conversation_id
       WHERE b.bot_id = ? OR m.bot_id = ? ORDER BY l.updated_at DESC`,
      bot.id,
      bot.id,
    ).map((r) => this.toFolder(r));
  }

  private botFolder(bot: Bot, ref: string): LibraryFolder {
    const mine = this.foldersOf(bot);
    const found = mine.find((f) => f.id === ref) ?? mine.find((f) => f.name.toLowerCase() === ref.trim().toLowerCase());
    if (!found) throw new HttpError(403, "folder_not_yours", `"${ref}" is not a folder you work on; library.list shows yours`);
    return found;
  }

  // --- the bots' tools ---------------------------------------------------------------------------------

  tools(): ToolDefinition[] {
    const describe = (f: ConversationFile) => ({ id: f.id, name: f.name, type: f.mime, size: sizeText(f.size), addedAt: f.createdAt });
    const inFolder = (folderId: string) =>
      all(this.hub.db, "SELECT * FROM files WHERE folder_id = ? AND archived_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 500", folderId).map(toFile);
    return [
      {
        name: "library.list",
        description:
          "The Library folders you work on (given to you or to a group of yours), or, with `folder`, the files in one of them: id, name, type, size. Copy a file with library.get, keep what you make with library.save.",
        input: Type.Object({ folder: Type.Optional(Type.String({ description: "A folder's id (fld_…) or name" })) }),
        risk: "read",
        handler: async (input: { folder?: string }, ctx) => {
          if (input.folder) {
            const folder = this.botFolder(ctx.bot, input.folder);
            const files = inFolder(folder.id);
            return JSON.stringify({ folder: { id: folder.id, name: folder.name, description: folder.description }, files: files.map(describe) }, null, 2);
          }
          const folders = this.foldersOf(ctx.bot);
          return folders.length
            ? JSON.stringify(folders.map((f) => ({ id: f.id, name: f.name, description: f.description, files: f.files })), null, 2)
            : "No Library folder is given to you or to a group of yours.";
        },
      },
      {
        name: "library.get",
        description: "Copy a file of a Library folder you work on into your workspace (orbis-files/), by its id. Returns where it is and, for a small text file, its text.",
        input: Type.Object({ file: Type.String({ minLength: 1, description: "The file's id (fil_…)" }) }),
        risk: "read",
        handler: async (input: { file: string }, ctx) => {
          const file = this.file(input.file);
          if (!file.folderId) throw new HttpError(403, "folder_not_yours", "that file is in no folder you work on");
          this.botFolder(ctx.bot, file.folderId);
          const [copied] = this.files.copyToWorkspace(ctx.bot, [file]);
          const text = isText(file.mime) && file.size <= INLINE_TEXT_BYTES ? decodeText(this.files.bytes(file)) : null;
          const where = `${file.name} (${kindOf(file.mime)}, ${sizeText(file.size)}) is in your workspace at ${copied!.at}`;
          return text === null ? where : `${where}. Its text:\n${untrusted(`file:${file.name}`, text)}`;
        },
      },
      {
        name: "library.save",
        description:
          "Keep a file you made in the user's Library: in a folder you work on (`folder`), or on its own. When you work in a conversation it is also sent there. Give its path in your workspace; up to 25 MB.",
        input: Type.Object({
          path: Type.String({ minLength: 1, description: "The file's path in your workspace" }),
          folder: Type.Optional(Type.String({ description: "A folder's id (fld_…) or name, among yours" })),
          name: Type.Optional(Type.String({ maxLength: 200, description: "The name to keep it under" })),
          caption: Type.Optional(Type.String({ maxLength: 2_000, description: "A short text sent with it in the conversation" })),
        }),
        risk: "write",
        defaultDecision: "allow",
        handler: async (input: { path: string; folder?: string; name?: string; caption?: string }, ctx) => {
          const folder = input.folder ? this.botFolder(ctx.bot, input.folder) : null;
          const extra = { folderId: folder?.id ?? null, source: this.sourceOf(ctx.run), ...(input.name ? { name: safeName(input.name) } : {}) };
          let file: ConversationFile;
          if (ctx.run.conversationId) {
            file = this.files.send(ctx.bot, ctx.run, input.path, input.caption ?? "", extra).file;
          } else {
            const at = this.files.workspaceFile(ctx.bot, input.path);
            file = this.files.store(null, extra.name ?? path.basename(at), undefined, readFileSync(at), { type: "bot", id: ctx.bot.id }, extra);
          }
          this.touchFolder(folder?.id ?? null);
          this.changed([file.id], folder?.id ?? null);
          return `Kept ${file.name} (${sizeText(file.size)}) in the Library${folder ? ` folder "${folder.name}"` : ""} as ${file.id}.`;
        },
      },
    ];
  }

  /** Where a file a run keeps comes from; a folder task's runs are set by the task (change 0080). */
  private sourceOf(run: Run) {
    return this.taskSource?.(run) ?? sourceOf(run);
  }

  /** Set by the folder tasks, to mark what their runs keep as the task's. */
  taskSource: ((run: Run) => "task" | null) | null = null;

  // --- routes --------------------------------------------------------------------------------------

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const IdParams = Type.Object({ id: Type.String() });
    const Ids = Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: MAX_BATCH });

    await root.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES }, (_req, body, done) => done(null, body));
      scope.withTypeProvider<TypeBoxTypeProvider>().post("/api/v1/library/files", { bodyLimit: MAX_FILE_BYTES, schema: { tags: ["library"] } }, async (req, reply) => {
        const header = (name: string) => {
          const raw = req.headers[name];
          const value = Array.isArray(raw) ? raw[0] : raw;
          if (!value) return null;
          try {
            return decodeURIComponent(value);
          } catch {
            return value;
          }
        };
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        reply.code(201);
        return this.upload(header("x-file-name") ?? "file", req.headers["content-type"], body, header("x-folder-id"));
      });
    });

    app.get(
      "/api/v1/library",
      {
        schema: {
          tags: ["library"],
          querystring: Type.Object({
            kind: Type.Optional(Type.Union([Type.Literal("image"), Type.Literal("video"), Type.Literal("audio"), Type.Literal("doc")])),
            q: Type.Optional(Type.String({ maxLength: 200 })),
            folder: Type.Optional(Type.String()),
            archived: Type.Optional(Type.Boolean()),
            cursor: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
          }),
        },
      },
      async (req): Promise<LibraryPage> => this.list(req.query),
    );
    app.get("/api/v1/library/usage", { schema: { tags: ["library"] } }, async (): Promise<LibraryUsage> => this.usage());
    app.get("/api/v1/library/files/:id", { schema: { tags: ["library"], params: IdParams } }, async (req) => this.file(req.params.id));
    app.patch(
      "/api/v1/library/files/:id",
      {
        schema: {
          tags: ["library"],
          params: IdParams,
          body: Type.Object(
            { archived: Type.Optional(Type.Boolean()), folderId: Type.Optional(Type.Union([Type.String(), Type.Null()])), name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })) },
            { additionalProperties: false },
          ),
        },
      },
      async (req) => this.update([req.params.id], req.body)[0],
    );
    app.delete("/api/v1/library/files/:id", { schema: { tags: ["library"], params: IdParams } }, async (req, reply) => {
      this.delete([req.params.id]);
      return reply.code(204).send();
    });
    app.post(
      "/api/v1/library/files/:id/forward",
      {
        schema: {
          tags: ["library"],
          params: IdParams,
          body: Type.Object(
            { botId: Type.Optional(Type.String()), conversationId: Type.Optional(Type.String()), text: Type.Optional(Type.String({ maxLength: 20_000 })) },
            { additionalProperties: false },
          ),
        },
      },
      async (req, reply) => {
        const sent = this.forward([req.params.id], req.body, req.body.text ?? "");
        reply.code(201);
        return { conversationId: sent.conversationId, item: sent.item };
      },
    );
    app.post(
      "/api/v1/library/batch",
      {
        schema: {
          tags: ["library"],
          body: Type.Object(
            {
              ids: Ids,
              action: Type.Union([Type.Literal("delete"), Type.Literal("archive"), Type.Literal("unarchive"), Type.Literal("move"), Type.Literal("forward")]),
              folderId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
              botId: Type.Optional(Type.String()),
              conversationId: Type.Optional(Type.String()),
              text: Type.Optional(Type.String({ maxLength: 20_000 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (req) => {
        const { ids, action } = req.body;
        if (action === "delete") return { deleted: this.delete(ids) };
        if (action === "archive" || action === "unarchive") return { files: this.update(ids, { archived: action === "archive" }) };
        if (action === "move") {
          if (req.body.folderId === undefined) throw badRequest("no folder", { folderId: "name the folder, or null to take them out" });
          return { files: this.update(ids, { folderId: req.body.folderId }) };
        }
        const sent = this.forward(ids, req.body, req.body.text ?? "");
        return { conversationId: sent.conversationId, item: sent.item };
      },
    );

    const FolderBody = Type.Object({ name: Type.String({ minLength: 1, maxLength: 120 }), description: Type.Optional(Type.String({ maxLength: 2_000 })) }, { additionalProperties: false });
    app.get("/api/v1/library/folders", { schema: { tags: ["library"] } }, async () => this.folders());
    app.post("/api/v1/library/folders", { schema: { tags: ["library"], body: FolderBody } }, async (req, reply) => {
      reply.code(201);
      return this.createFolder(req.body);
    });
    app.get("/api/v1/library/folders/:id", { schema: { tags: ["library"], params: IdParams } }, async (req) => this.folder(req.params.id));
    app.patch(
      "/api/v1/library/folders/:id",
      { schema: { tags: ["library"], params: IdParams, body: Type.Object({ name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })), description: Type.Optional(Type.String({ maxLength: 2_000 })) }, { additionalProperties: false }) } },
      async (req) => this.updateFolder(req.params.id, req.body),
    );
    app.delete(
      "/api/v1/library/folders/:id",
      { schema: { tags: ["library"], params: IdParams, querystring: Type.Object({ withFiles: Type.Optional(Type.Boolean()) }) } },
      async (req, reply) => {
        this.deleteFolder(req.params.id, req.query.withFiles === true);
        return reply.code(204).send();
      },
    );
    app.put(
      "/api/v1/library/folders/:id/assignees",
      {
        schema: {
          tags: ["library"],
          params: IdParams,
          body: Type.Object({ bots: Type.Array(Type.String(), { maxItems: 50 }), groups: Type.Array(Type.String(), { maxItems: 20 }) }, { additionalProperties: false }),
        },
      },
      async (req) => this.assign(req.params.id, req.body),
    );
  }
}
