// Tools of a bot's computer: shell, files and browser (specs/computer, specs/tool-gateway).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import Type from "typebox";
import type { Bot } from "@orbis/shared";
import { untrusted, type ToolDefinition } from "../tools/registry.js";
import type { BrowserService } from "./browser.js";
import { TakeoverNeeded } from "./browser.js";
import type { ComputerManager } from "./manager.js";
import { confine, display } from "./paths.js";
import { SHELL_OUTPUT_CAP, SHELL_TIMEOUT_SEC, type ExecResult } from "./provider.js";

const READ_CHARS = 20_000;
/** Files larger than this are not read whole into memory: the bot reads them with the shell (head, findstr…). */
export const READ_MAX_BYTES = 10 * 1024 * 1024;

/** A missing path, said as the bot can act on it (not as an ENOENT with the hub's full path). */
function missing(requested: string, what: "file" | "folder"): { output: string; isError: true } {
  return { output: `there is no ${what} "${requested}" in your workspace; computer.list_files shows what is there`, isError: true };
}

/** True when the start of a file holds NUL bytes: an image, a PDF, a program — not text. */
export function looksBinary(head: Buffer): boolean {
  return head.subarray(0, 8192).includes(0);
}
const LIST_ENTRIES = 500;

function listDir(root: string, dir: string, recursive: boolean, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= LIST_ENTRIES) return;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      out.push(`${rel}/`);
      if (recursive) listDir(root, full, true, out);
    } else if (entry.isSymbolicLink()) {
      out.push(`${rel} -> (link)`);
    } else {
      out.push(`${rel}  ${statSync(full).size} B`);
    }
  }
}

/** Characters of shell output shown to the model: the start and the end, where errors usually are. */
const SHELL_HEAD_CHARS = 4_000;
const SHELL_TAIL_CHARS = 14_000;

export function formatShell(res: ExecResult, seconds: number): string {
  const status = res.timedOut ? `timed out after ${seconds}s; the command was killed` : `exit code: ${res.exitCode ?? "none"}`;
  const notes: string[] = [];
  if (res.droppedBytes > 0) notes.push(`output cut at 64 KiB: ${res.droppedBytes} more bytes dropped`);
  let body = res.output;
  if (body.length > SHELL_HEAD_CHARS + SHELL_TAIL_CHARS) {
    const omitted = body.length - SHELL_HEAD_CHARS - SHELL_TAIL_CHARS;
    body = `${body.slice(0, SHELL_HEAD_CHARS)}\n[… ${omitted} characters omitted …]\n${body.slice(-SHELL_TAIL_CHARS)}`;
    notes.push("long output: redirect it to a file and read it with computer.read_file");
  }
  const head = notes.length ? `${status} (${notes.join("; ")})` : status;
  return `${head}\n${body}`.trimEnd();
}

export function computerTools(computers: ComputerManager, browser: BrowserService): ToolDefinition[] {
  /** The folder file tools reach: the bot's workspace, or the folder the user chose on their machine (`host`). */
  const workspace = (bot: Bot) => computers.workDir(bot);
  const Target = {
    ref: Type.Optional(Type.String({ description: "a reference from the last snapshot: l3 (link), f1 (field), b2 (button)" })),
    selector: Type.Optional(Type.String({ description: "a CSS selector, when no reference fits" })),
    text: Type.Optional(Type.String({ description: "visible text of the element, when no reference fits" })),
  };
  const browsed = (source: string, text: string) => untrusted(source, text);
  const guard = async (fn: () => Promise<string>): Promise<string | { output: string; isError: boolean }> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TakeoverNeeded) return { output: err.message, isError: true };
      throw err;
    }
  };

  return [
    {
      name: "computer.shell",
      secrets: true,
      description:
        "Run a shell command on your own computer, in your workspace directory. Returns the exit code and the combined output (at most 64 KiB). Commands are killed after timeoutSec (default 120).",
      input: Type.Object({
        command: Type.String({ minLength: 1, maxLength: 20_000 }),
        timeoutSec: Type.Optional(Type.Integer({ minimum: 1, maximum: 900 })),
        reason: Type.Optional(Type.String({ maxLength: 500, description: "why you run it; shown to the user when approval is needed" })),
      }),
      risk: "write",
      defaultDecision: "ask",
      handler: async (input: { command: string; timeoutSec?: number }, ctx) => {
        const seconds = input.timeoutSec ?? SHELL_TIMEOUT_SEC;
        const res = await computers.exec(ctx.bot, input.command, { timeoutMs: seconds * 1000, signal: ctx.signal, outputCap: SHELL_OUTPUT_CAP });
        return { output: formatShell(res, seconds), isError: res.timedOut || res.exitCode !== 0 };
      },
    },
    {
      name: "computer.read_file",
      description: "Read a text file from your workspace (path relative to it). Long files are returned in pages: use offset.",
      input: Type.Object({
        path: Type.String({ minLength: 1, maxLength: 1000 }),
        offset: Type.Optional(Type.Integer({ minimum: 0, description: "character offset to start from" })),
      }),
      risk: "read",
      handler: async (input: { path: string; offset?: number }, ctx) => {
        await computers.ensure(ctx.bot);
        const root = workspace(ctx.bot);
        const file = confine(root, input.path);
        if (!existsSync(file)) return missing(input.path, "file");
        const info = statSync(file);
        if (info.isDirectory()) return { output: `${input.path} is a directory; use computer.list_files`, isError: true };
        if (info.size > READ_MAX_BYTES) {
          return {
            output: `${input.path} has ${info.size} bytes, too large to read whole; look into it with computer.shell (a search or its first lines)`,
            isError: true,
          };
        }
        const raw = readFileSync(file);
        if (looksBinary(raw))
          return { output: `${input.path} is a binary file (${info.size} bytes), not text; computer.shell can inspect or convert it`, isError: true };
        const text = raw.toString("utf8");
        const start = input.offset ?? 0;
        const page = text.slice(start, start + READ_CHARS);
        const more = text.length > start + READ_CHARS ? `\n[… ${text.length - start - READ_CHARS} more characters; next offset ${start + READ_CHARS}]` : "";
        return page + more;
      },
    },
    {
      name: "computer.write_file",
      secrets: true,
      description: "Write a text file in your workspace (path relative to it), creating folders as needed. append adds to the end instead of replacing.",
      input: Type.Object({
        path: Type.String({ minLength: 1, maxLength: 1000 }),
        content: Type.String({ maxLength: 1_000_000 }),
        append: Type.Optional(Type.Boolean()),
      }),
      risk: "write",
      // On the user's own machine, writing a file waits for approval unless a rule says otherwise.
      defaultDecision: (bot: Bot) => (computers.providerKind(bot) === "host" ? "ask" : "allow"),
      handler: async (input: { path: string; content: string; append?: boolean }, ctx) => {
        await computers.ensure(ctx.bot);
        const root = workspace(ctx.bot);
        const file = confine(root, input.path);
        mkdirSync(path.dirname(file), { recursive: true });
        // The parent now exists: confine again so a symlinked folder cannot redirect the write.
        confine(root, input.path);
        if (input.append) appendFileSync(file, input.content);
        else writeFileSync(file, input.content);
        return `${input.append ? "appended" : "wrote"} ${Buffer.byteLength(input.content)} bytes to ${display(root, file)}`;
      },
    },
    {
      name: "computer.list_files",
      description: "List the files of a folder in your workspace (default: the workspace itself).",
      input: Type.Object({
        path: Type.Optional(Type.String({ maxLength: 1000 })),
        recursive: Type.Optional(Type.Boolean()),
      }),
      risk: "read",
      handler: async (input: { path?: string; recursive?: boolean }, ctx) => {
        await computers.ensure(ctx.bot);
        const root = workspace(ctx.bot);
        const dir = confine(root, input.path ?? ".");
        if (!existsSync(dir)) return missing(input.path ?? ".", "folder");
        if (!statSync(dir).isDirectory()) return { output: `${input.path} is a file; read it with computer.read_file`, isError: true };
        const entries: string[] = [];
        listDir(dir, dir, input.recursive ?? false, entries);
        if (entries.length === 0) return `${display(root, dir)} is empty`;
        return `${display(root, dir)}:\n${entries.join("\n")}${entries.length >= LIST_ENTRIES ? `\n[… listing stopped at ${LIST_ENTRIES} entries]` : ""}`;
      },
    },
    {
      name: "browser.open",
      secrets: true,
      description:
        "Open a web page in your own browser and return a text snapshot: title, text, and links, fields and buttons with references (l1, f1, b1) to use with browser.click and browser.type.",
      input: Type.Object({ url: Type.String({ minLength: 1, maxLength: 4000 }) }),
      risk: "external",
      handler: async (input: { url: string }, ctx) => {
        let url: URL;
        try {
          url = new URL(input.url);
        } catch {
          return { output: `not a URL: ${input.url}`, isError: true };
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return { output: "browser.open only opens http and https pages", isError: true };
        return browsed(url.href, await browser.navigate(ctx.bot, url.href));
      },
    },
    {
      name: "browser.snapshot",
      description:
        "Return a text snapshot of the page open in your browser, with fresh references. A long page's text comes in parts: offset reads on from where the last part stopped.",
      input: Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0, description: "character of the page text to start from" })) }),
      risk: "read",
      handler: async (input: { offset?: number }, ctx) => {
        const { text, data } = await browser.snapshot(ctx.bot, input.offset ?? 0);
        return browsed(data.url, text);
      },
    },
    {
      name: "browser.click",
      description: "Click a link or button on the open page (by reference, selector or visible text) and return the new snapshot.",
      input: Type.Object(Target),
      risk: "external",
      handler: async (input: { ref?: string; selector?: string; text?: string }, ctx) =>
        guard(async () => browsed("browser", await browser.click(ctx.bot, input))),
    },
    {
      name: "browser.type",
      secrets: true,
      description:
        "Type text into a field of the open page (by reference, selector or visible text); submit presses Enter afterwards. Never for passwords: ask the user to take over instead.",
      input: Type.Object({ ...Target, value: Type.String({ maxLength: 20_000 }), submit: Type.Optional(Type.Boolean()) }),
      risk: "external",
      handler: async (input: { ref?: string; selector?: string; text?: string; value: string; submit?: boolean }, ctx) =>
        guard(async () => browsed("browser", await browser.type(ctx.bot, input, input.value, input.submit ?? false))),
    },
    {
      name: "browser.press",
      description: "Press a key in the open page (Enter, Escape, Tab, ArrowDown, PageDown…) and return the new snapshot.",
      input: Type.Object({ key: Type.String({ minLength: 1, maxLength: 40 }) }),
      risk: "external",
      handler: async (input: { key: string }, ctx) => browsed("browser", await browser.press(ctx.bot, input.key)),
    },
    {
      name: "browser.screenshot",
      description: "Save a screenshot of the open page as a PNG in your workspace (screenshots/) and show it in the live view.",
      input: Type.Object({}),
      risk: "read",
      handler: async (_input: object, ctx) => {
        if (!browser.isOpen(ctx.bot.id)) return { output: "your browser is not open; use browser.open first", isError: true };
        const shot = await browser.screenshot(ctx.bot, true);
        if (!shot?.file) return { output: "no page to capture", isError: true };
        const root = realpathSync(workspace(ctx.bot));
        const where = shot.file.startsWith(root + path.sep) ? display(root, shot.file) : shot.file;
        return `saved ${where} (${shot.png.length} bytes)`;
      },
    },
    {
      name: "browser.close",
      description: "Close your browser. Cookies and logins stay in your profile for next time.",
      input: Type.Object({}),
      risk: "read",
      handler: async (_input: object, ctx) => {
        await browser.close(ctx.bot.id);
        return "browser closed";
      },
    },
  ];
}
