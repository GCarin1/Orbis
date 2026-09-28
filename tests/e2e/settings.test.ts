// The settings screen end to end in a real browser: the brains on this machine,
// the brain test that proves a model answered, and each bot's brain
// (specs/web-app, specs/agent-runtimes).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-settings";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");
const fakeCursor = path.resolve(import.meta.dirname, "../../packages/hub/test/fixtures/fake-cursor.mjs");

let hub: Hub;
let url: string;
let browser: Browser;
let ollama: Server;
const dirs: string[] = [];

/** A stand-in Ollama: two models, and it answers the test question. */
async function fakeOllama(): Promise<string> {
  ollama = createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "llama3.2:latest" }, { id: "qwen3:4b" }] }));
      return;
    }
    for await (const _ of req) void _;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "391" } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => ollama.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(ollama.address() as AddressInfo).port}/v1`;
}

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  const ollamaBaseUrl = await fakeOllama();
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir, ollamaBaseUrl, lmstudioBaseUrl: "http://127.0.0.1:9/v1" } });
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  await new Promise<void>((r) => (ollama ? ollama.close(() => r()) : r()));
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("settings screen in a browser", () => {
  it("shows the brains, proves a model answers, flags the mock's echo and opens a bot's brain settings", async () => {
    hub.botService.create({ name: "Cursa", role: "Dev", brain: { kind: "cursor", command: process.execPath, args: [fakeCursor] } });
    hub.botService.create({ name: "Echo", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByRole("navigation", { name: "Orbis" }).getByRole("button", { name: "⚙ Settings" }).click();
    const screen = page.getByTestId("settings-screen");
    await screen.getByRole("heading", { level: 1, name: "Settings" }).waitFor();

    // A local model server: running, its models listed, and the test answers 391.
    const ollamaCard = screen.getByTestId("brain-ollama");
    await ollamaCard.getByText("✓ Running, 2 models").waitFor();
    await ollamaCard.getByLabel("Model").selectOption("qwen3:4b");
    await ollamaCard.getByRole("button", { name: "Test" }).click();
    await ollamaCard.getByRole("status").getByText(/✓ Answered in [\d.]+ s: 391/).waitFor();
    await screen.getByTestId("brain-lmstudio").getByText("✗ Off").waitFor();

    // A bot's own brain: the Cursor CLI answers; the mock only echoes.
    const cursa = screen.getByTestId("brain-bot-cursa");
    expect(await cursa.textContent()).toContain("Cursor CLI");
    await cursa.getByRole("button", { name: "Test" }).click();
    await cursa.getByRole("status").getByText(/✓ Answered in [\d.]+ s: 391/).waitFor();
    const echo = screen.getByTestId("brain-bot-echo");
    await echo.getByRole("button", { name: "Test" }).click();
    await echo.getByRole("status").getByText(/no model answered/).waitFor();

    // Configure opens the bot with its settings panel on the brain it uses.
    await cursa.getByRole("button", { name: /Configure/ }).click();
    await page.getByRole("heading", { level: 1, name: /Cursa @cursa/ }).waitFor();
    expect(await page.getByTestId("brain-badge").textContent()).toContain("Cursor CLI");
    expect(await page.getByTestId("settings-panel").getByLabel("Brain").inputValue()).toBe("cursor");
  });
});
