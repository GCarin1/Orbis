// Screenshots of Orbis's features for the user to see (the orbis-screens skill): starts a throwaway hub with
// sample data, drives the web app with Playwright, and writes one PNG per screen plus an index.md. Nothing of
// the user's own data is touched: the hub lives in a temporary folder and is removed at the end.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = process.argv[2] ?? path.join(process.env.SCREENS_DIR ?? "/tmp", "orbis-screens");
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
mkdirSync(out, { recursive: true });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGNgYPj/n4GBgYGBgYGBgQAAAPwCwiF9pyoAAAAASUVORK5CYII=",
  "base64",
);

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

async function startHub(dataDir, port) {
  const child = spawn(process.execPath, [path.join(root, "packages/cli/dist/index.js"), "serve"], {
    env: { ...process.env, ORBIS_DATA_DIR: dataDir, ORBIS_PORT: String(port), ORBIS_HOST: "127.0.0.1", ORBIS_SUPABASE_URL: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { child, base };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error("the hub did not start");
}

async function seed(base, token) {
  const api = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof Buffer) ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  const ana = await api("POST", "/api/v1/bots", { name: "Ana", role: "Design", brain: { kind: "mock" } });
  const bia = await api("POST", "/api/v1/bots", { name: "Bia", role: "Copy", brain: { kind: "mock" } });
  const group = await api("POST", "/api/v1/conversations", { title: "Marketing", members: [ana.id, bia.id] });
  const conv = (await api("GET", `/api/v1/bots/${ana.id}/conversation`));
  const up = (name, type, body, folder) => api("POST", "/api/v1/library/files", body, { "x-file-name": encodeURIComponent(name), "content-type": type, ...(folder ? { "x-folder-id": folder } : {}) });
  const folder = await api("POST", "/api/v1/library/folders", { name: "Evento", description: "Fotos da festa para escolher e legendar" });
  await api("PUT", `/api/v1/library/folders/${folder.id}/assignees`, { bots: [ana.id, bia.id], groups: [] });
  await up("praia.png", "image/png", PNG, folder.id);
  await up("pôr do sol.png", "image/png", PNG, folder.id);
  await up("contrato.pdf", "application/pdf", Buffer.from("%PDF-1.4 exemplo"));
  // A conversation's file, sent in a message, so the Library lists both kinds.
  const sent = await api("POST", `/api/v1/conversations/${conv.id}/files`, Buffer.from("texto de exemplo"), { "x-file-name": encodeURIComponent("notas.txt"), "content-type": "text/plain" });
  await api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "Veja as notas", attachments: [sent.id] });
  // A finished task on the folder, its team's answer as the result.
  const task = await api("POST", `/api/v1/library/folders/${folder.id}/tasks`, { text: "/reply Escolhi as duas fotos e escrevi as legendas" });
  for (let i = 0; i < 100; i++) {
    const now = await api("GET", `/api/v1/library/tasks/${task.id}`);
    if (now.status !== "running") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // A file to delete in a message, so the placeholder shows.
  const gone = await api("POST", `/api/v1/conversations/${conv.id}/files`, Buffer.from("apagado"), { "x-file-name": encodeURIComponent("rascunho.txt"), "content-type": "text/plain" });
  await api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "", attachments: [gone.id] });
  await api("DELETE", `/api/v1/library/files/${gone.id}`);
  // A group in the new default (short replies, the team backstage): Ana hands a part to Bia and answers once.
  const ask = `/tool team.handoff {"to":"bia","task":"/reply Revisei as três legendas: a segunda é a mais forte, a terceira ficou longa demais"}\n/reply Vou ver com a Bia e já te falo`;
  await api("POST", `/api/v1/conversations/${group.id}/messages`, { text: ask });
  for (let i = 0; i < 100; i++) {
    const page = await api("GET", `/api/v1/conversations/${group.id}/items?limit=50`);
    const items = Array.isArray(page) ? page : page.items;
    if (items.some((it) => it.kind === "message" && it.author?.type === "bot" && !it.backstage)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { folder, group, ana };
}

/** Each screen: a feature, a name, the steps to reach it. Add a new feature here; nothing else changes. */
const screens = [
  { feature: "biblioteca", name: "tudo", steps: async (page) => { await page.getByRole("button", { name: /Biblioteca/ }).click(); await page.getByTestId("library-grid").waitFor(); } },
  { feature: "biblioteca", name: "arquivo-aberto", steps: async (page) => { await page.getByRole("button", { name: "Abrir praia.png" }).click(); await page.getByTestId("library-sheet").waitFor(); } },
  { feature: "biblioteca", name: "selecao", steps: async (page) => { await page.getByRole("button", { name: "Selecionar" }).click(); await page.getByRole("button", { name: "Selecionar praia.png" }).click(); await page.getByRole("toolbar").waitFor(); } },
  { feature: "pastas", name: "pasta-com-tarefa", steps: async (page) => { await page.getByRole("tab", { name: "Pastas" }).click(); await page.locator("button.library-folder", { hasText: "Evento" }).click(); await page.getByTestId("task-card").waitFor(); } },
  { feature: "pastas", name: "equipe", steps: async (page) => { await page.getByRole("tab", { name: "Pastas" }).click(); await page.locator("button.library-folder", { hasText: "Evento" }).click(); await page.locator("button.btn-sm", { hasText: "Equipe" }).first().click(); await page.getByRole("dialog", { name: "Quem trabalha nesta pasta" }).waitFor(); } },
  { feature: "bastidores", name: "conversa", steps: async (page) => { await page.locator('[data-testid^="conv-"]', { hasText: "Marketing" }).click(); await page.getByTestId("backstage-link").waitFor({ timeout: 15_000 }); } },
  { feature: "bastidores", name: "dialogo", steps: async (page) => { await page.locator('[data-testid^="conv-"]', { hasText: "Marketing" }).click(); await page.getByTestId("backstage-link").click(); await page.getByTestId("backstage").waitFor(); } },
  { feature: "bastidores", name: "configuracoes", steps: async (page) => { await page.getByRole("button", { name: /Configurações/ }).click(); await page.getByRole("tab", { name: "Conversas" }).click(); await page.locator("#settings-panel-conversations").waitFor(); } },
];

async function main() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-screens-"));
  const port = await freePort();
  const { child, base } = await startHub(dataDir, port);
  const index = [];
  const browser = await chromium.launch({ headless: true, ...(process.env.ORBIS_BROWSER_EXECUTABLE ? { executablePath: process.env.ORBIS_BROWSER_EXECUTABLE } : {}) });
  try {
    const token = readFileSync(path.join(dataDir, "token"), "utf8").trim();
    await seed(base, token);
    // Each screen on a computer-width window (the side menu stays in view). A phone capture needs the menu opened first; not yet done.
    const plans = [
      { scheme: "light", viewport: { width: 1280, height: 800 }, mobile: false, only: null },
      { scheme: "dark", viewport: { width: 1280, height: 800 }, mobile: false, only: ["tudo"] },
    ];
    for (const plan of plans) {
      for (const screen of screens) {
        if (only && !only.has(screen.feature)) continue;
        if (plan.only && !plan.only.includes(screen.name)) continue;
        const context = await browser.newContext({ viewport: plan.viewport, deviceScaleFactor: 2, isMobile: plan.mobile, colorScheme: plan.scheme, locale: "pt-BR" });
        const page = await context.newPage();
        await page.goto(`${base}/#token=${token}`);
        await page.getByRole("button", { name: /Biblioteca/ }).waitFor({ timeout: 15_000 });
        // Every screen starts from the Library, so its steps can build on it.
        await page.getByRole("button", { name: /Biblioteca/ }).click();
        await page.getByTestId("library-grid").waitFor();
        await screen.steps(page);
        const device = plan.mobile ? "celular" : "computador";
        const file = `${screen.feature}-${screen.name}-${device}-${plan.scheme}.png`;
        await page.screenshot({ path: path.join(out, file), fullPage: false });
        index.push({ file, feature: screen.feature, name: screen.name, scheme: plan.scheme, device });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
  const lines = ["# Prints do Orbis", "", ...index.map((i) => `- \`${i.file}\` — ${i.feature}: ${i.name} (${i.device}, ${i.scheme === "dark" ? "escuro" : "claro"})`)];
  writeFileSync(path.join(out, "index.md"), lines.join("\n") + "\n");
  console.log(JSON.stringify(index));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
