// specs/hiring — hiring in a real browser: the user describes a project, gets short résumés written by a
// recruiter bot's brain, hires one, and talks with the new bot, who says what it will do and needs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";
import { recruiterBrain } from "./recruiter-brain.js";

const TOKEN = "e2e-hiring";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
const dirs: string[] = [];

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  hub.brains.register(recruiterBrain());
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await hub?.hiring.wait();
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("hiring in a browser", () => {
  it("writes résumés for a project, hires one, and the new bot says hello with what it will do and needs", async () => {
    hub.botService.create({ name: "Rita", role: "RH", brain: { kind: "mock" } });
    const page = await (await browser.newContext({ locale: "pt-BR", viewport: { width: 1366, height: 900 } })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page.getByRole("button", { name: "💼 Contratação" }).click();
    const screen = page.getByTestId("hiring");
    await screen.getByText("Nenhuma vaga ainda.", { exact: false }).waitFor();
    await screen.getByLabel("O projeto").fill("Um painel de ações brasileiras com alertas de preço");
    await screen.getByRole("button", { name: "5", exact: true }).click();
    await screen.getByRole("button", { name: "Gerar 5 candidatos" }).click();

    // The résumés arrive over the stream.
    const lia = screen.getByRole("article", { name: "Lia, Analista de dados" });
    await lia.waitFor();
    expect(await screen.getByRole("article").count()).toBe(5);
    await screen.getByText(/por Rita · candidatos: 5 · contratados: 0 · 1\.400 tokens/).waitFor();

    await lia.getByRole("button", { name: "Contratar" }).click();
    const sheet = page.getByRole("dialog", { name: "Contratar Lia" });
    await sheet.getByRole("button", { name: "Contratar Lia" }).click();
    await lia.getByText("Contratado").waitFor();
    await lia.getByRole("button", { name: "Abrir conversa" }).click();

    // The new bot's chat: its first message says what it will do and what it needs.
    const hello = page.getByTestId("message").filter({ hasText: "Olá! Sou Lia" });
    await hello.getByText("Olá! Sou Lia e começo pelo relatório semanal.").waitFor();
    await hello.getByText("Montar o relatório semanal de métricas").waitFor();
    await hello.getByText("Acesso de leitura à planilha de vendas").waitFor();
    const lia2 = hub.botService.list().find((b) => b.name === "Lia")!;
    expect(lia2).toMatchObject({ role: "Analista de dados", tools: ["*", "!computer.*", "!browser.*"] });
    expect(hub.skills.store.list(lia2.id).map((s) => s.name)).toEqual(["relatorio-semanal"]);
  }, 90_000);
});
