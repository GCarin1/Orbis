// specs/web-app — acceptance criterion 1 (the sidebar: one list, faces, state
// in words, unread dots, search, the new menu).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation } from "@orbis/shared";
import { chatEntries, Sidebar } from "../src/components/Sidebar.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const at = (d: string) => `2026-09-${d}T10:00:00.000Z`;
const zed = bot({ name: "Zed", role: "Engineering", state: "working", lastMessage: { text: "Building", at: at("20") } });
const ana = bot({ name: "Ana", role: "QA", state: "waiting", lastMessage: { text: "Deploy checklist passed", at: at("27") } });
const chief = bot({ name: "Chief", role: "Operations", pinned: true, state: "done", avatar: { initials: "CH", color: "#8b5cf6", shape: "cloud" } });
const ghost = bot({ name: "Ghost", role: "QA", hidden: true });
const loner = bot({ name: "Loner", state: "blocked" });
const group: Conversation = { id: "cnv_g", kind: "group", title: "Launch", members: [ana.id, zed.id], leadBotId: ana.id, createdAt: at("10"), lastItemAt: at("25") };
const anaDm: Conversation = { id: "cnv_ana", kind: "direct", title: "Ana", members: [ana.id], leadBotId: ana.id, createdAt: at("01"), lastItemAt: at("27") };
const bots = Object.fromEntries([zed, ana, chief, ghost, loner].map((b) => [b.id, b]));

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    bots,
    conversations: [group, anaDm],
    approvals: [],
    selectedBotId: null,
    selectedGroupId: null,
    view: "chat" as const,
    isUnread: (id: string | undefined) => id === "cnv_ana",
    onOpenBot: vi.fn(),
    onOpenGroup: vi.fn(),
    onNewBot: vi.fn(),
    onNewGroup: vi.fn(),
    onView: vi.fn(),
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe("sidebar", () => {
  it("lists bots and groups in one list, pinned first then by latest activity, with faces and states in words (criterion 1)", () => {
    const props = renderSidebar();
    const list = screen.getByRole("navigation", { name: "Conversations" });
    const rows = within(list).getAllByRole("button").map((b) => b.getAttribute("data-testid"));
    expect(rows).toEqual(["bot-chief", "bot-ana", "conv-cnv_g", "bot-zed", "bot-loner"]);
    expect(screen.queryByText("Ghost")).toBeNull();

    // The face says who and in which state; a busy bot says it in words too.
    expect(screen.getByRole("img", { name: "Chief: Done" })).toBeTruthy();
    expect(within(screen.getByTestId("bot-chief")).getByRole("img").closest("svg")!.classList.contains("face-cloud")).toBe(true);
    expect(within(screen.getByTestId("bot-ana")).getByText(/Waiting for you/)).toBeTruthy();
    expect(within(screen.getByTestId("bot-zed")).getByText(/Working/)).toBeTruthy();
    expect(within(screen.getByTestId("bot-loner")).getByText(/Blocked/)).toBeTruthy();
    // A group shows its members' faces and names.
    expect(screen.getByTestId("conv-cnv_g").textContent).toContain("Ana, Zed");

    // Unread conversations get a dot.
    expect(within(screen.getByTestId("bot-ana")).getByLabelText("unread")).toBeTruthy();
    expect(within(screen.getByTestId("bot-zed")).queryByLabelText("unread")).toBeNull();

    fireEvent.click(screen.getByTestId("bot-ana"));
    expect(props.onOpenBot).toHaveBeenCalledWith(ana.id);
    fireEvent.click(screen.getByTestId("conv-cnv_g"));
    expect(props.onOpenGroup).toHaveBeenCalledWith("cnv_g");
  });

  it("filters by name, handle or role, and opens a new bot or group from the + menu", () => {
    const props = renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "engin" } });
    expect(screen.getByTestId("bot-zed")).toBeTruthy();
    expect(screen.queryByTestId("bot-ana")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "nobody" } });
    expect(screen.getByText("Nothing matches “nobody”.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "+ New bot" }));
    expect(props.onNewBot).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "+ New group" }));
    expect(props.onNewGroup).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "⚙ Settings" }));
    expect(props.onView).toHaveBeenCalledWith("settings");
  });

  it("invites the user to create a first bot when there is none", () => {
    const props = renderSidebar({ bots: {}, conversations: [] });
    expect(screen.getByText("No chats yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create your first bot/ }));
    expect(props.onNewBot).toHaveBeenCalled();
  });

  it("orders entries by pin, then latest activity (a bot's own messages or its conversation), then name", () => {
    const entries = chatEntries([bot({ name: "Old", lastMessage: { text: "a", at: at("01") } }), bot({ name: "Never" }), bot({ name: "New", lastMessage: { text: "b", at: at("27") } })], []);
    expect(entries.map((e) => e.title)).toEqual(["New", "Old", "Never"]);
  });
});
