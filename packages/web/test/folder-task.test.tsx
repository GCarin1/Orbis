// specs/web-app — a Library folder's task and its board (change 0080-folder-tasks): the task is written and
// started, each bot's step shows, the team's conversation opens, the result shows, and a task is cancelled.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FolderTask, LibraryFolder } from "@orbis/shared";
import { Api } from "../src/api.js";
import { FolderTaskBoard } from "../src/components/FolderTaskBoard.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "Design" });
const bia = bot({ name: "Bia", role: "Copy" });
const api = new Api("tok-1");
api.setFileKey("key-1");
const folder: LibraryFolder = { id: "fld_1", name: "Evento", description: "", bots: [ana.id, bia.id], groups: [], files: 3, bytes: 10, createdAt: "2026-10-14T10:00:00.000Z", updatedAt: "2026-10-14T10:00:00.000Z" };
const task = (over: Partial<FolderTask> = {}): FolderTask => ({
  id: "tsk_1",
  folderId: folder.id,
  text: "Escolham as 3 melhores fotos",
  conversationId: "cnv_room",
  leadBotId: ana.id,
  status: "running",
  result: "",
  steps: [
    { botId: ana.id, status: "doing", note: "dividindo o trabalho", updatedAt: "2026-10-14T10:01:00.000Z" },
    { botId: bia.id, status: "pending", note: "", updatedAt: "2026-10-14T10:01:00.000Z" },
  ],
  files: [],
  createdAt: "2026-10-14T10:00:00.000Z",
  endedAt: null,
  ...over,
});

function fakeHub(tasks: () => FolderTask[]) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/tasks") && method === "GET") return json(tasks());
      if (url.endsWith("/tasks") && method === "POST") return json(task(), 201);
      if (url.endsWith("/cancel")) return json(task({ status: "cancelled" }));
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

describe("a folder's task board", () => {
  it("starts a task, shows each bot's step, opens the team's conversation and cancels it", async () => {
    let list: FolderTask[] = [];
    const calls = fakeHub(() => list);
    const onOpen = vi.fn();
    render(<FolderTaskBoard api={api} folder={folder} bots={{ [ana.id]: ana, [bia.id]: bia }} onOpenConversation={onOpen} />);
    fireEvent.change(screen.getByLabelText("Nova tarefa para a equipe"), { target: { value: "Escolham as 3 melhores fotos" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Começar" })));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ text: "Escolham as 3 melhores fotos" });

    const card = await screen.findByTestId("task-card");
    expect(card.textContent).toMatch(/Em andamento/);
    const steps = within(card).getByRole("list", { name: "Quem está fazendo o quê" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Ana · coordena🔄 fazendodividindo o trabalho", "Bia⏳ aguardando"]);
    // While it runs, no second task can be written.
    expect(screen.queryByLabelText("Nova tarefa para a equipe")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Abrir a conversa" }));
    expect(onOpen).toHaveBeenCalledWith("cnv_room");

    list = [task({ status: "cancelled" })];
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Cancelar tarefa" })));
    expect(calls.some((c) => c.url.endsWith("/api/v1/library/tasks/tsk_1/cancel"))).toBe(true);
    act(() => useStore.setState({ libraryVersion: 1 }));
    await waitFor(() => expect(screen.getByTestId("task-card").textContent).toMatch(/Cancelada/));
  });

  it("shows the result and the files kept, and asks for a team first", async () => {
    fakeHub(() => [task({ status: "done", result: "As 3 melhores: **a.png**, b.png, c.png", files: ["fil_a", "fil_b"], steps: [{ botId: ana.id, status: "done", note: "", updatedAt: "" }] })]);
    const { unmount } = render(<FolderTaskBoard api={api} folder={folder} bots={{ [ana.id]: ana }} />);
    const card = await screen.findByTestId("task-card");
    expect(card.textContent).toMatch(/Concluída/);
    expect(within(card).getByText("Resultado")).toBeTruthy();
    expect(card.textContent).toMatch(/As 3 melhores: a\.png, b\.png, c\.png/);
    expect(card.textContent).toMatch(/2 arquivo\(s\) guardado\(s\) na pasta/);
    unmount();

    fakeHub(() => []);
    render(<FolderTaskBoard api={api} folder={{ ...folder, bots: [], groups: [] }} bots={{}} />);
    expect(screen.getByText("Designe bots ou um grupo à pasta primeiro.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Começar" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
