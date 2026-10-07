// specs/web-app — a group like a chat app's (change 0042-group-info-like-a-chat-app): the header with its
// photo, name and members, the ⋮ menu with every option, the info flyout (photo, name, description,
// members, links, search) and the dialog that adds members.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation, TimelineItem } from "@orbis/shared";
import { AddMembersDialog, conversationText, GroupHeader, GroupInfoPanel, type GroupActions } from "../src/components/GroupInfo.js";
import { Timeline } from "../src/components/Timeline.js";
import type { Api } from "../src/api.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const ana = bot({ name: "Ana", role: "Research" });
const bia = bot({ name: "Bia", role: "QA", state: "working" });
const cid = bot({ name: "Cid" });
const bots = Object.fromEntries([ana, bia, cid].map((b) => [b.id, b]));
const group = (over: Partial<Conversation> = {}): Conversation => ({
  id: "cnv_g",
  kind: "group",
  title: "Time",
  members: [ana.id, bia.id],
  leadBotId: ana.id,
  description: "",
  photo: null,
  muted: false,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastItemAt: null,
  ...over,
});
const actions = (): GroupActions & Record<string, ReturnType<typeof vi.fn>> => ({
  info: vi.fn(),
  add: vi.fn(),
  mute: vi.fn(async () => undefined),
  exportChat: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
});
const item = (id: string, text: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id,
  conversationId: "cnv_g",
  kind: "message",
  author: { type: "user", id: null },
  text,
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  runId: null,
  createdAt: "2026-10-02T15:16:00.000Z",
  updatedAt: "2026-10-02T15:16:00.000Z",
  ...over,
});

describe("the group's header and ⋮ menu", () => {
  it("shows the photo, the name, who is working, and opens the info from the face or the name", () => {
    const a = actions();
    render(<GroupHeader group={group({ muted: true })} bots={bots} onBack={() => undefined} actions={a} />);
    expect(screen.getByRole("heading", { level: 1, name: /Time/ })).toBeTruthy();
    expect(screen.getByText("Bia working…")).toBeTruthy();
    expect(screen.getByLabelText("Muted")).toBeTruthy();
    fireEvent.click(screen.getByTestId("group-face"));
    fireEvent.click(screen.getByRole("heading", { level: 1, name: /Time/ }));
    expect(a.info).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(a.info).toHaveBeenLastCalledWith("search");
  });

  it("lists every group option, the rarer ones under More", async () => {
    const a = actions();
    render(<GroupHeader group={group({ photo: "data:image/png;base64,AAAA" })} bots={bots} onBack={() => undefined} actions={a} />);
    expect(screen.getByTestId("group-face").querySelector("img.group-photo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual(["Add members", "Group info", "Files", "Group links", "Search", "Mute notifications", "More"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Add members" }));
    expect(a.add).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mute notifications" }));
    expect(a.mute).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "More" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Back", "Export chat", "Clear conversation", "Delete group"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete group" }));
    expect(a.remove).toHaveBeenCalled();
    // Escape closes it.
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("adding members", () => {
  it("picks bots outside the group, up to its limit, and says why when there is none to add", async () => {
    const onAdd = vi.fn(async () => undefined);
    const onNewBot = vi.fn();
    const { unmount } = render(
      <AddMembersDialog group={group()} bots={[ana, bia, cid]} maxGroupSize={6} onAdd={onAdd} onNewBot={onNewBot} onCancel={() => undefined} />,
    );
    expect(screen.getByText("2 of 6 bots in the group")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Cid/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(onAdd).toHaveBeenCalledWith([cid.id]);
    unmount();

    const all = render(
      <AddMembersDialog
        group={group({ members: [ana.id, bia.id, cid.id] })}
        bots={[ana, bia, cid]}
        maxGroupSize={6}
        onAdd={onAdd}
        onNewBot={onNewBot}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText(/All your bots are already in this group/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ New bot" }));
    expect(onNewBot).toHaveBeenCalled();
    all.unmount();

    render(<AddMembersDialog group={group()} bots={[ana, bia, cid]} maxGroupSize={2} onAdd={onAdd} onNewBot={onNewBot} onCancel={() => undefined} />);
    expect(screen.getByText(/holds its limit of 2 bots.*ORBIS_MAX_GROUP_SIZE/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("the group's info", () => {
  const links = [{ url: "https://example.com/report", itemId: "itm_2", author: { type: "bot" as const, id: ana.id }, createdAt: "2026-10-02T15:18:00.000Z" }];
  function info(over: Partial<Conversation> = {}, view: "info" | "search" | "links" = "info") {
    const get = vi.fn(async (path: string) =>
      path.endsWith("/links") ? links : path.includes("/search?q=") ? [item("itm_1", "A AÇÃO subiu hoje, veja o relatório")] : [],
    );
    const props = {
      onUpdate: vi.fn(async () => undefined),
      onRemoveMember: vi.fn(async () => undefined),
      onOpenBot: vi.fn(),
      onShowItem: vi.fn(async () => undefined),
      onView: vi.fn(),
      readPhoto: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    };
    const a = actions();
    render(<GroupInfoPanel api={{ get } as unknown as Api} group={group(over)} bots={bots} view={view} onClose={() => undefined} actions={a} {...props} />);
    return { get, a, ...props };
  }

  it("shows the photo, name, members, description and links, and edits them", async () => {
    const p = info();
    await act(async () => undefined);
    const panel = screen.getByTestId("group-info");
    expect(within(panel).getByText("Time")).toBeTruthy();
    expect(within(panel).getAllByText("2 members").length).toBeGreaterThan(0);
    expect(within(panel).getByText("example.com")).toBeTruthy();

    // A photo picked is shrunk and saved.
    const file = new File(["x"], "foto.png", { type: "image/png" });
    await act(async () => fireEvent.change(within(panel).getByLabelText("Change group photo", { selector: "input" }), { target: { files: [file] } }));
    expect(p.readPhoto).toHaveBeenCalledWith(file);
    expect(p.onUpdate).toHaveBeenCalledWith({ photo: "data:image/jpeg;base64,AAAA" });

    // The description, read by the group's bots.
    fireEvent.click(within(panel).getByRole("button", { name: "Add group description" }));
    expect(within(panel).getByText(/read the description as the group's purpose/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Group description"), { target: { value: "  Revisar os lançamentos  " } });
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    expect(p.onUpdate).toHaveBeenCalledWith({ description: "Revisar os lançamentos" });

    // The name.
    fireEvent.click(within(panel).getByRole("button", { name: "Rename group" }));
    fireEvent.change(within(panel).getByLabelText("Group name"), { target: { value: "Time 2" } });
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    expect(p.onUpdate).toHaveBeenCalledWith({ title: "Time 2" });

    // A member: message it, make it lead, remove it.
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const biaRow = within(panel).getByTestId(`member-${bia.handle}`);
    expect(within(within(panel).getByTestId(`member-${ana.handle}`)).getByText("Lead")).toBeTruthy();
    fireEvent.click(within(biaRow).getByRole("button", { expanded: false }));
    await act(async () => fireEvent.click(within(biaRow).getByRole("button", { name: "Make lead" })));
    expect(p.onUpdate).toHaveBeenCalledWith({ leadBotId: bia.id });
    await act(async () => fireEvent.click(within(biaRow).getByRole("button", { name: "Remove Bia from the group" })));
    expect(p.onRemoveMember).toHaveBeenCalledWith(bia.id);
    fireEvent.click(within(biaRow).getByRole("button", { name: "Message Bia" }));
    expect(p.onOpenBot).toHaveBeenCalledWith(bia.id);

    // Adding, muting, exporting and the danger zone go to the group's actions.
    fireEvent.click(within(panel).getAllByRole("button", { name: /Add members/ })[0]!);
    expect(p.a.add).toHaveBeenCalled();
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Mute" })));
    expect(p.a.mute).toHaveBeenCalledWith(true);
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Delete group" })));
    expect(p.a.remove).toHaveBeenCalled();
  });

  it("searches the messages and shows the one picked", async () => {
    const p = info({}, "search");
    fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "acao" } });
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(p.get).toHaveBeenCalledWith("/api/v1/conversations/cnv_g/search?q=acao");
    const mark = screen.getByText("AÇÃO");
    expect(mark.tagName).toBe("MARK");
    await act(async () => fireEvent.click(mark.closest("button")!));
    expect(p.onShowItem).toHaveBeenCalledWith("itm_1");
  });

  it("lists the links with who wrote them", async () => {
    info({}, "links");
    await act(async () => undefined);
    expect(screen.getByRole("link", { name: /example\.com/ }).getAttribute("href")).toBe("https://example.com/report");
    expect(screen.getByRole("button", { name: /Ana ·/ })).toBeTruthy();
  });
});

describe("the timeline and the export", () => {
  it("says the group's changes as a chat app does, and marks a message shown from a search", () => {
    const items = [
      item("itm_e1", 'You renamed the group "Time 2"', { kind: "event", event: { type: "group.renamed", data: { title: "Time 2" } } }),
      item("itm_e2", "Bia now leads the group", { kind: "event", event: { type: "group.lead", data: { botId: bia.id, name: "Bia" } } }),
      item("itm_e3", "x", { kind: "event", event: { type: "group.photo", data: { removed: true } } }),
      item("itm_m", "olá"),
    ];
    act(() => useLang.getState().setLang("pt-BR"));
    render(<Timeline items={items} bots={bots} runs={{}} activeRuns={[]} focus={{ itemId: "itm_m", at: 1 }} />);
    expect(screen.getAllByTestId("event").map((e) => e.textContent)).toEqual([
      'Você mudou o nome do grupo para "Time 2"',
      "Bia agora é o líder do grupo",
      "Você removeu a foto do grupo",
    ]);
    expect(document.getElementById("item-itm_m")?.classList.contains("flash")).toBe(true);
  });

  it("exports the conversation as text, one line each", () => {
    const text = conversationText(
      group(),
      [item("i1", "oi", {}), item("i2", "olá!", { author: { type: "bot", id: ana.id } }), item("i3", "Ana joined the group", { kind: "event" })],
      bots,
      "en-GB",
      "You",
    );
    expect(text.split("\n")).toEqual([
      "Time",
      "[02/10/2026, 15:16] You: oi",
      "[02/10/2026, 15:16] Ana: olá!",
      "[02/10/2026, 15:16] — Ana joined the group",
      "",
    ]);
  });
});
