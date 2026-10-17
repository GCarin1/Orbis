// Documents the bots can read (specs/conversations, change 0084-document-reading): before a bot starts on a
// message with a PDF, the hub reads it once with poppler — its text (with tesseract when the pages are scans)
// and its pages as images, a big drawing sheet also cut into tiles for the details — so the bot reads files it
// already knows how to open instead of picking the PDF apart with scripts. A drawing's lettering (CAD text drawn
// as lines, not text) is read by OCR from its tiles. Each file is read once and kept in
// <data>/documents/<file id>/; without poppler on the hub, the bot is told so.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The pages shown as images (and read by OCR) at most. */
export const MAX_PAGES = 20;
/** Pages cut into tiles at most, and tiles per page: a big sheet's details, not a whole book's. */
const MAX_TILED_PAGES = 3;
const MAX_TILES = 16;
/** A page longer than this (points, a bit more than A3's 1191) is a sheet that also gets tiles. */
const TILE_FROM_PT = 1250;
/** The longest side of a page image and of a tile, in pixels: what a model reads without shrinking much. */
const PAGE_PX = 1600;
const TILE_PX = 1400;
/** Under this many words a page, the PDF is scanned pages: OCR reads them. */
const SCANNED_WORDS_PER_PAGE = 15;
const COMMAND_MS = 60_000;
const VERSION = 2;

export interface DocumentImage {
  page: number;
  /** A tile's row and column (from 1), or none for the whole page. */
  tile?: { row: number; col: number };
  /** The file's name in the document's folder. */
  name: string;
}

export interface ReadDocument {
  version: number;
  pages: number;
  /** The page size of the first page, in points, as it shows (rotation applied). */
  size: { width: number; height: number } | null;
  /** The text, with long runs of spaces squeezed; empty when there is none. */
  text: string;
  words: number;
  /** The text came from OCR (scanned pages). */
  ocr: boolean;
  /** A big sheet's lettering read by OCR from its tiles (CAD drawings draw most of their text as lines). */
  drawing: string;
  images: DocumentImage[];
  /** Tiles' grid per tiled page. */
  grids: Record<number, { rows: number; cols: number }>;
  /** Why some of it could not be read, for the bot to say. */
  problem: string | null;
}

type Run = (cmd: string, args: string[]) => Promise<string>;

const run: Run = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: COMMAND_MS, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd}: ${(stderr || err.message).trim().split("\n").slice(-1)[0]}`));
      else resolve(stdout);
    });
  });

/** Text as a model reads it best: no lines of spaces, no runs of blank lines. */
export function squeeze(text: string): string {
  return text
    .replace(/\f/g, "\n")
    .split("\n")
    .map((line) => line.replace(/ {4,}/g, "   ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const countWords = (text: string) => (text.match(/[\p{L}\p{N}]{2,}/gu) ?? []).length;

export class DocumentReader {
  private readonly inFlight = new Map<string, Promise<ReadDocument>>();
  private tools: Promise<{ poppler: boolean; ocr: string | null }> | null = null;

  constructor(
    private readonly root: string,
    private readonly exec: Run = run,
  ) {}

  /** Whether a file is a document this reader reads. */
  static reads(mime: string): boolean {
    return mime === "application/pdf";
  }

  folderOf(fileId: string): string {
    return path.join(this.root, fileId);
  }

  /** The documents read before, kept for the files that still exist. */
  sweep(known: Set<string>): void {
    if (!existsSync(this.root)) return;
    for (const name of readdirSync(this.root)) if (!known.has(name)) rmSync(path.join(this.root, name), { recursive: true, force: true });
  }

  drop(fileId: string): void {
    rmSync(this.folderOf(fileId), { recursive: true, force: true });
  }

  /** Read a document once (later calls get the same result), from the file's bytes at `source`. */
  read(fileId: string, source: string): Promise<ReadDocument> {
    const done = this.saved(fileId);
    if (done) return Promise.resolve(done);
    let reading = this.inFlight.get(fileId);
    if (!reading) {
      reading = this.readNow(fileId, source).finally(() => this.inFlight.delete(fileId));
      this.inFlight.set(fileId, reading);
    }
    return reading;
  }

  private saved(fileId: string): ReadDocument | null {
    try {
      const doc = JSON.parse(readFileSync(path.join(this.folderOf(fileId), "document.json"), "utf8")) as ReadDocument;
      return doc.version === VERSION ? doc : null;
    } catch {
      return null;
    }
  }

  private available(): Promise<{ poppler: boolean; ocr: string | null }> {
    this.tools ??= (async () => {
      const poppler = await this.exec("pdftoppm", ["-v"]).then(
        () => true,
        (err: Error) => !/ENOENT|not found/i.test(err.message), // `pdftoppm -v` exits non-zero on some versions
      );
      const langs = await this.exec("tesseract", ["--list-langs"]).catch(() => null);
      const have = langs ? langs.split("\n").map((l) => l.trim()) : [];
      const ocr = langs === null ? null : ["por", "eng"].filter((l) => have.includes(l)).join("+") || "eng";
      return { poppler, ocr };
    })();
    return this.tools;
  }

  private async readNow(fileId: string, source: string): Promise<ReadDocument> {
    const tools = await this.available();
    const doc: ReadDocument = { version: VERSION, pages: 0, size: null, text: "", words: 0, ocr: false, drawing: "", images: [], grids: {}, problem: null };
    if (!tools.poppler) {
      return { ...doc, problem: "this hub has no PDF tools (poppler-utils: pdftotext, pdftoppm), so Orbis could not read inside the PDF" };
    }
    // Written aside and moved in place at the end, so a half-read document is never taken as read.
    const folder = this.folderOf(fileId);
    const work = `${folder}.reading`;
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const problems: string[] = [];
    try {
      const info = await this.exec("pdfinfo", ["-f", "1", "-l", String(MAX_PAGES), source]);
      doc.pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
      const sizes = pageSizes(info);
      doc.size = sizes.get(1) ?? null;

      const text = squeeze(await this.exec("pdftotext", ["-layout", "-enc", "UTF-8", source, "-"]).catch((err: Error) => (problems.push(err.message), "")));
      doc.text = text;
      doc.words = countWords(text);

      const shown = Math.min(doc.pages, MAX_PAGES);
      for (let page = 1; page <= shown; page++) {
        const name = `page-${page}`;
        await this.exec("pdftoppm", ["-png", "-scale-to", String(PAGE_PX), "-f", String(page), "-l", String(page), "-singlefile", source, path.join(work, name)]);
        doc.images.push({ page, name: `${name}.png` });
      }
      let tiled = 0;
      for (let page = 1; page <= shown && tiled < MAX_TILED_PAGES; page++) {
        const size = sizes.get(page);
        if (!size || Math.max(size.width, size.height) <= TILE_FROM_PT) continue;
        tiled++;
        const { dpi, cols, rows } = tileGrid(size);
        doc.grids[page] = { rows, cols };
        const width = Math.ceil((size.width * dpi) / 72);
        const height = Math.ceil((size.height * dpi) / 72);
        for (let row = 1; row <= rows; row++) {
          for (let col = 1; col <= cols; col++) {
            const x = (col - 1) * TILE_PX;
            const y = (row - 1) * TILE_PX;
            const name = `page-${page}-r${row}c${col}`;
            await this.exec("pdftoppm", [
              "-png", "-r", String(dpi), "-f", String(page), "-l", String(page),
              "-x", String(x), "-y", String(y), "-W", String(Math.min(TILE_PX, width - x)), "-H", String(Math.min(TILE_PX, height - y)),
              "-singlefile", source, path.join(work, name),
            ]);
            doc.images.push({ page, tile: { row, col }, name: `${name}.png` });
          }
        }
      }
      if (tools.ocr) {
        const lettering: string[] = [];
        for (const image of doc.images.filter((i) => i.tile)) {
          const read = squeeze(await this.exec("tesseract", [path.join(work, image.name), "stdout", "-l", tools.ocr]).catch(() => ""));
          if (countWords(read) > 0) lettering.push(`[page ${image.page}, tile r${image.tile!.row}c${image.tile!.col}]\n${read}`);
        }
        doc.drawing = lettering.join("\n\n");
      }

      // Scanned pages carry no text: read them with OCR, when the hub has it.
      if (doc.pages > 0 && doc.words < SCANNED_WORDS_PER_PAGE * Math.min(doc.pages, MAX_PAGES)) {
        if (tools.ocr) {
          const parts: string[] = [];
          for (let page = 1; page <= shown; page++) {
            const image = path.join(work, `ocr-${page}`);
            await this.exec("pdftoppm", ["-png", "-r", "200", "-f", String(page), "-l", String(page), "-singlefile", source, image]);
            parts.push(await this.exec("tesseract", [`${image}.png`, "stdout", "-l", tools.ocr]).catch((err: Error) => (problems.push(err.message), "")));
            rmSync(`${image}.png`, { force: true });
          }
          const read = squeeze(parts.join("\n\n"));
          if (countWords(read) > doc.words) Object.assign(doc, { text: read, words: countWords(read), ocr: true });
        } else if (doc.words === 0) {
          problems.push("its pages are images and this hub has no OCR (tesseract-ocr): read the page images");
        }
      }
      if (doc.pages > MAX_PAGES) problems.push(`only its first ${MAX_PAGES} of ${doc.pages} pages are shown as images`);
      if (doc.text) writeFileSync(path.join(work, "text.txt"), doc.text + "\n");
      if (doc.drawing) writeFileSync(path.join(work, "drawing.txt"), doc.drawing + "\n");
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
    doc.problem = problems.length ? problems.join("; ") : null;
    writeFileSync(path.join(work, "document.json"), JSON.stringify(doc));
    rmSync(folder, { recursive: true, force: true });
    renameSync(work, folder);
    return doc;
  }
}

/** Each page's size as it shows, from `pdfinfo -f -l` (a page turned 90° or 270° swaps its sides). */
function pageSizes(info: string): Map<number, { width: number; height: number }> {
  const sizes = new Map<number, { width: number; height: number }>();
  const rotations = new Map<number, number>();
  for (const m of info.matchAll(/^Page\s+(\d+)\s+rot:\s+(\d+)/gm)) rotations.set(Number(m[1]), Number(m[2]));
  for (const m of info.matchAll(/^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/gm)) {
    const page = Number(m[1]);
    const [w, h] = [Number(m[2]), Number(m[3])];
    sizes.set(page, (rotations.get(page) ?? 0) % 180 === 90 ? { width: h, height: w } : { width: w, height: h });
  }
  if (sizes.size === 0) {
    // One page: plain `pdfinfo` prints "Page size" and "Page rot".
    const m = /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)/m.exec(info);
    const rot = Number(/^Page rot:\s+(\d+)/m.exec(info)?.[1] ?? 0);
    if (m) sizes.set(1, rot % 180 === 90 ? { width: Number(m[2]), height: Number(m[1]) } : { width: Number(m[1]), height: Number(m[2]) });
  }
  return sizes;
}

/** The resolution and grid that cut a page into at most MAX_TILES tiles of TILE_PX, as sharp as that allows (≤150 dpi). */
export function tileGrid(size: { width: number; height: number }): { dpi: number; cols: number; rows: number } {
  for (let dpi = 150; ; dpi -= 10) {
    const cols = Math.ceil((size.width * dpi) / 72 / TILE_PX);
    const rows = Math.ceil((size.height * dpi) / 72 / TILE_PX);
    if (cols * rows <= MAX_TILES || dpi <= 50) return { dpi, cols, rows };
  }
}
