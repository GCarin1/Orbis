// Voice and theme in a real browser (specs/web-app, specs/hub-api): with a fake
// microphone and no browser dictation, the user speaks, the recording goes
// through the hub to a transcription service, the words land in the composer
// and are sent; the dark theme is picked and survives a reload
// (change 0016-voice-and-theme).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-voice";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
let transcriber: Server;
const uploads: Array<{ type: string; bytes: number; language: string | null }> = [];
const dirs: string[] = [];

beforeAll(async () => {
  transcriber = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": String(req.headers["content-type"]) } }).formData();
    const file = form.get("file") as File;
    uploads.push({ type: file.type, bytes: file.size, language: form.get("language") as string | null });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "status report please" }));
  });
  await new Promise<void>((r) => transcriber.listen(0, "127.0.0.1", () => r()));
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  hub = await createHub({
    env: { ORBIS_TRANSCRIBE_URL: `http://127.0.0.1:${(transcriber.address() as AddressInfo).port}/v1` },
    config: { dataDir, token: TOKEN, port: 0, webDir: outDir },
  });
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    ...(executablePath ? { executablePath } : {}),
  });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  await new Promise<void>((r) => (transcriber ? transcriber.close(() => r()) : r()));
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("voice and theme in a browser", () => {
  it("speaks a message through the hub's transcription and keeps the dark theme after a reload", async () => {
    hub.botService.create({ name: "Chief", role: "Chief of Staff", brain: { kind: "mock" } });
    const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 860 } });
    await context.grantPermissions(["microphone"]);
    // Like the desktop app or Firefox: no dictation in the browser, so the recording goes to the hub.
    await context.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    });
    const page = await context.newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByTestId("bot-chief").click();

    await page.getByRole("button", { name: "Speak" }).click();
    await page.getByTestId("voice-status").getByText(/Recording/).waitFor();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Stop listening" }).click();
    const composer = page.getByRole("textbox", { name: /Message Chief/ });
    await expect.poll(() => composer.inputValue(), { timeout: 15_000 }).toBe("status report please");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.type).toMatch(/^audio\//);
    expect(uploads[0]!.bytes).toBeGreaterThan(0);
    expect(uploads[0]!.language).toBe("en");

    await composer.press("Enter");
    await page.getByRole("log").getByText("status report please").first().waitFor();

    // Theme: System → Light → Dark, applied at once and kept after a reload.
    await page.getByRole("button", { name: "Theme: System" }).click();
    await page.getByRole("button", { name: "Theme: Light" }).click();
    await page.getByRole("button", { name: "Theme: Dark" }).waitFor();
    const dark = () => page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor]);
    expect(await dark()).toEqual(["dark", "rgb(18, 18, 22)"]);
    await page.reload();
    await page.getByRole("button", { name: "Theme: Dark" }).waitFor();
    expect(await dark()).toEqual(["dark", "rgb(18, 18, 22)"]);
    await context.close();
  });
});
