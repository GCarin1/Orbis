// specs/web-app — the Library (change 0079-library): every file as a grid with its tabs, opened with its
// actions, forwarded to a bot, selected several at a time, folders and who works on them, the space used, and
// a message whose file was deleted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Conversation, LibraryFile, LibraryFolder, LibraryUsage } from "@orbis/shared";
import { Api } from "../src/api.js";
import { LibraryScreen } from "../src/components/LibraryScreen.js";
import { FileAttachments } from "../src/components/Files.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "Design" });
const bia = bot({ name: "Bia", role: "Copy" });
const group: Conversation = { id: "cnv_g", kind: "group", title: "Marketing", members: [ana.id, bia.id], leadBotId: ana.id } as Conversation;
const api = new Api("tok-1");
api.setFileKey("key-1");

const file = (name: string, mime: string, over: Partial<LibraryFile> = {}): LibraryFile => ({
  id: `fil_${name.replace(/\W/g, "")}`,
  conversationId: "cnv_1",
  conversationTitle: "Ana",
  name,
  mime,
  size: 2048,
  author: { type: "bot", id: ana.id },
  itemId: "itm_1",
  createdAt: "2026-10-14T10:00:00.000Z",
  folderId: null,
  archivedAt: null,
  source: "chat",
  ...over,
});
const photo = file("praia.png", "image/png");
const report = file("relatorio.pdf", "application/pdf", { conversationId: null, conversationTitle: null, source: "library" });
const folder: LibraryFolder = { id: "fld_1", name: "Evento", description: "Fotos para escolher", bots: [ana.id], groups: [], files: 1, bytes: 2048, createdAt: "2026-10-14T10:00:00.000Z", updatedAt: "2026-10-14T10:00:00.000Z" };
const usage: LibraryUsage = { total: 4096, files: 2, byKind: { image: 2048, video: 0, audio: 0, doc: 2048 }, largest: [photo, report], disk: { free: 200 * 1024 ** 3, size: 469 * 1024 ** 3 } };

/** The hub: answers each path, and records what was asked. */
function fakeHub(used: LibraryUsage = usage) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      calls.push({ method, url, body });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      const u = new URL(url, "http://hub");
      if (u.pathname === "/api/v1/library/folders" && method === "GET") return json([folder]);
      if (u.pathname === "/api/v1/library/usage") return json(used);
      if (u.pathname === "/api/v1/library" && u.searchParams.get("folder")) return json({ files: [photo], next: null });
      if (u.pathname === "/api/v1/library" && u.searchParams.get("kind") === "image") return json({ files: [photo], next: null });
      if (u.pathname === "/api/v1/library") return json({ files: [photo, report], next: null });
      if (u.pathname === "/api/v1/library/batch") return json({ ok: true });
      if (u.pathname === "/api/v1/library/files" && method === "POST") return json(file("novo.txt", "text/plain"), 201);
      if (u.pathname.endsWith("/assignees")) return json({ ...folder, bots: [ana.id, bia.id], groups: [group.id] });
      return json({});
    }),
  );
  return calls;
}

beforeEach(() => {
  act(() => useLang.getState().setLang("pt-BR"));
  act(() => useStore.setState({ api, bots: { [ana.id]: ana, [bia.id]: bia }, libraryVersion: 0 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderLibrary = () => render(<LibraryScreen api={api} bots={[ana, bia]} conversations={[group]} />);

describe("the Library screen", () => {
  it("shows every file as a grid, the folders above it, the space used in one line under it, and filters by tab and name", async () => {
    const calls = fakeHub();
    renderLibrary();
    await waitFor(() => expect(screen.getAllByTestId("library-tile")).toHaveLength(2));
    // Folders are their own section, not a tab.
    expect(within(screen.getByRole("region", { name: "Pastas" })).getByRole("button", { name: /Evento/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Pastas" })).toBeNull();
    // The space used: one quiet line while the disk has room; a tap opens the card.
    const line = screen.getByTestId("library-usage");
    expect(line.textContent).toMatch(/^O Orbis usa 4 KB · .+ livres no disco$/);
    fireEvent.click(line);
    expect(screen.getByTestId("library-usage").textContent).toMatch(/4 KB em 2 arquivo\(s\)/);
    expect(screen.getByTestId("library-usage").textContent).toMatch(/livres de/);
    fireEvent.click(screen.getByRole("button", { name: "Ver os maiores arquivos" }));
    expect(screen.getByRole("button", { name: "Apagar praia.png" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Imagens" }));
    await waitFor(() => expect(screen.getAllByTestId("library-tile")).toHaveLength(1));
    expect(calls.some((c) => c.url.includes("kind=image"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Buscar por nome"), { target: { value: "praia" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=praia"))).toBe(true));
  });

  it("shows the space as a card on its own once the disk is nearly full", async () => {
    fakeHub({ ...usage, disk: { free: 20 * 1024 ** 3, size: 469 * 1024 ** 3 } });
    renderLibrary();
    await waitFor(() => expect(screen.getByRole("region", { name: "Espaço" })).toBeTruthy());
    expect(screen.getByRole("meter", { name: "Disco usado" }).getAttribute("aria-valuenow")).toBe("96");
  });

  it("opens a file with its actions and forwards it to a bot with a message", async () => {
    const calls = fakeHub();
    renderLibrary();
    await waitFor(() => expect(screen.getAllByTestId("library-tile")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Abrir praia.png" }));
    const sheet = screen.getByTestId("library-sheet");
    expect(within(sheet).getByRole("img").getAttribute("src")).toBe("/api/v1/files/fil_praiapng/content?key=key-1");
    expect(sheet.textContent).toMatch(/em Ana/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Encaminhar" }));
    const dialog = screen.getByRole("dialog", { name: "Encaminhar para…" });
    fireEvent.change(within(dialog).getByLabelText("Mensagem (opcional)"), { target: { value: "Melhore a cor" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /Bia/ })));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/api/v1/library/batch"))?.body).toEqual({ ids: [photo.id], action: "forward", botId: bia.id, text: "Melhore a cor" }));
    expect(await screen.findByText("1 arquivo(s) enviado(s) para Bia.")).toBeTruthy();
  });

  it("selects several files and archives, moves or deletes them together", async () => {
    const calls = fakeHub();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByTestId("library-tile")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar praia.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar relatorio.pdf" }));
    const bar = screen.getByRole("toolbar", { name: "2 selecionado(s)" });
    await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "Arquivar" })));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ ids: [photo.id, report.id], action: "archive" }));

    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar praia.png" }));
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Mover para pasta" }));
    await act(async () => fireEvent.click(within(screen.getByRole("dialog", { name: "Mover para…" })).getByRole("button", { name: /Evento/ })));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ ids: [photo.id], action: "move", folderId: folder.id }));

    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar relatorio.pdf" }));
    await act(async () => fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Apagar" })));
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ ids: [report.id], action: "delete" }));
    expect(window.confirm).toHaveBeenCalledWith("Apagar 1 arquivo(s)? Eles somem também das conversas.");
  });

  it("opens a folder, adds files to it and says who works on it", async () => {
    const calls = fakeHub();
    renderLibrary();
    fireEvent.click(await screen.findByRole("button", { name: /Evento/ }));
    expect(await screen.findByText("Fotos para escolher")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.url.includes("folder=fld_1"))).toBe(true));

    const upload = new File(["oi"], "novo.txt", { type: "text/plain" });
    await act(async () => fireEvent.change(screen.getByTestId("library-input"), { target: { files: [upload] } }));
    const sent = calls.find((c) => c.url.endsWith("/api/v1/library/files"))!;
    expect(sent.method).toBe("POST");
    expect(await screen.findByText("1 arquivo(s) na Biblioteca.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    const dialog = screen.getByRole("dialog", { name: "Quem trabalha nesta pasta" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bia/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Marketing/ }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" })));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/assignees"))?.body).toEqual({ bots: [ana.id, bia.id], groups: [group.id] }));
  });
});

describe("a message whose file was deleted", () => {
  it("says the file was deleted", () => {
    render(<FileAttachments files={[]} deleted={1} />);
    expect(screen.getByTestId("file-deleted").textContent).toMatch(/Arquivo apagado/);
  });
});
