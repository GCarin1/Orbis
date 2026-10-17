// specs/conversations — documents the bots can read (change 0084-document-reading): before a bot starts on a
// message with a PDF, the hub reads it once — its text, its pages as images, a big sheet also in tiles — puts
// that next to the PDF in the bot's workspace and says so, with the text, in its task; brains that see get the
// pages as images; a hub without the PDF tools says so instead of leaving the bot to pick the PDF apart.
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConversationFile, Run } from "@orbis/shared";
import { DocumentReader, squeeze, tileGrid } from "../src/files/documents.js";
import { paperOf } from "../src/files/service.js";
import { createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
const dirs: string[] = [];
afterEach(async () => {
  await t?.cleanup();
  t = null;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const has = (cmd: string) => {
  try {
    execFileSync(cmd, ["-v"], { stdio: "ignore" });
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ENOENT";
  }
};
const poppler = has("pdftoppm");

/** A one-page PDF of the given size (points) with a line of text, its offsets counted. */
function pdf(width: number, height: number, text: string): Buffer {
  const stream = `BT /F1 60 Tf 120 ${height - 200} Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function upload(conversationId: string, name: string, body: Buffer) {
  const res = await t!.hub.app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversationId}/files`,
    headers: { authorization: `Bearer ${TOKEN}`, "x-file-name": encodeURIComponent(name), "content-type": "application/pdf" },
    payload: body,
  });
  return JSON.parse(res.body) as ConversationFile;
}

describe("reading documents for the bots", () => {
  it("squeezes a drawing's spaces, cuts a sheet into a grid of tiles and names its paper", () => {
    expect(squeeze("a" + " ".repeat(40) + "b  c\n\n\n\n\fd   ")).toBe("a   b  c\n\nd");
    // An A0 sheet, landscape: 5 × 3 tiles at 120 dpi; an A3 page fits one tile row at 150 dpi.
    expect(tileGrid({ width: 3370, height: 2384 })).toEqual({ dpi: 120, cols: 5, rows: 3 });
    expect(tileGrid({ width: 842, height: 1191 })).toEqual({ dpi: 150, cols: 2, rows: 2 });
    expect(paperOf({ width: 3370, height: 2384 })).toBe("A0");
    expect(paperOf({ width: 595, height: 842 })).toBe("A4");
    expect(paperOf({ width: 612, height: 792 })).toBeNull();
  });

  it("tells the bot when the hub has no PDF tools, instead of leaving it to pick the PDF apart", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-docs-"));
    dirs.push(dir);
    const missing = Object.assign(new Error("spawn pdftoppm ENOENT"), { code: "ENOENT" });
    const reader = new DocumentReader(dir, async () => {
      throw missing;
    });
    const doc = await reader.read("fil_none", path.join(dir, "x.pdf"));
    expect(doc).toMatchObject({ pages: 0, text: "", images: [] });
    expect(doc.problem).toMatch(/no PDF tools \(poppler-utils/);
  });

  it.skipIf(!poppler)("reads a sheet once — text, page image, tiles — and gives it to the bot in its workspace and task", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Fernanda" });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const file = await upload(conv.id, "projeto casa.pdf", pdf(3370, 2384, "Projeto aprovado casa com piscina"));
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "", attachments: [file.id] });
    const run = (await t.hub.engine.wait(posted.body.runs[0].id)) as Run;

    // In the workspace, next to the PDF: its text and its pages, the A0 sheet also in tiles.
    const folder = path.join(t.hub.computer.workDir(t.hub.botService.get(bot.id)), "orbis-files");
    expect(readFileSync(path.join(folder, "projeto casa.txt"), "utf8")).toContain("Projeto aprovado casa com piscina");
    const pages = readdirSync(path.join(folder, "projeto casa.pages")).sort();
    expect(pages).toContain("page-1.png");
    expect(pages).toContain("page-1-r1c1.png");
    expect(pages).toContain("page-1-r3c5.png");
    expect(pages.length).toBe(16);

    // The task says what was read and where, with the text, marked as data (the mock brain echoes it).
    expect(run.reply).toContain("What Orbis read in the documents of this message");
    expect(run.reply).toContain("- projeto casa.pdf: 1 page (A0, landscape).");
    expect(run.reply).toContain("orbis-files/projeto casa.pages/page-1.png");
    expect(run.reply).toContain("3 rows × 5 columns of tiles");
    expect(run.reply).toMatch(/<untrusted-content source="file:projeto casa.pdf">\nProjeto aprovado casa com piscina/);
    // Brains that see get the whole page as an image; the document is read once.
    const images = t.hub.files.imagesFor(run);
    expect(images.map((i) => [i.name, i.mime])).toEqual([["projeto casa.pdf — page 1", "image/png"]]);
    expect(existsSync(path.join(t.dataDir, "documents", file.id, "document.json"))).toBe(true);

    // files.get gives the same reading, without reading it again.
    const asked = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: `/tool files.get {"file":"projeto casa.pdf"}` });
    const got = (await t.hub.engine.wait(asked.body.runs[0].id)) as Run;
    const result = got.steps.find((s) => s.type === "tool_result") as { output: string };
    expect(result.output).toContain("What Orbis read in it:");
    expect(result.output).toContain("3 rows × 5 columns of tiles");
  });
});
