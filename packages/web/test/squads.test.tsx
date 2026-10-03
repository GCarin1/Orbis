// specs/squads — the Squads screen (a new squad, the org chart, each squad's manager, representative and
// members, the bots in no squad, one manager for all, the chats), the sidebar's squad filter, the squad in a
// bot's settings, and the routines other bots may call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation, Routine, Squad, SquadsView } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { BotSettings } from "../src/components/BotSettings.js";
import { RoutinesPanel } from "../src/components/RoutinesPanel.js";
import { Sidebar } from "../src/components/Sidebar.js";
import { SquadsScreen } from "../src/components/SquadsScreen.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  try {
    localStorage.clear();
  } catch {
    /* no storage */
  }
});

const ana = bot({ name: "Ana", role: "Analyst", squadId: "sqd_growth", reportsTo: "bot_max" });
const bob = bot({ name: "Bob", role: "Dev", squadId: "sqd_growth", reportsTo: "bot_ana" });
const cai = bot({ name: "Caio", role: "QA", squadId: "sqd_data" });
const max = bot({ name: "Max", role: "Director" });
const dan = bot({ name: "Dan", role: "Writer" });
const squad = (s: Partial<Squad> & { id: string; name: string; handle: string }): Squad => ({
  description: "",
  color: "#2563eb",
  representativeId: null,
  managerId: null,
  conversationId: null,
  members: [],
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z",
  ...s,
});
const growth = squad({
  id: "sqd_growth",
  name: "Growth",
  handle: "growth",
  members: [ana.id, bob.id],
  representativeId: ana.id,
  managerId: max.id,
  conversationId: "cnv_growth",
});
const data = squad({ id: "sqd_data", name: "Data", handle: "data", color: "#16a34a", members: [cai.id], representativeId: cai.id });
const view: SquadsView = { squads: [growth, data], roomId: "cnv_room" };

function fakeApi() {
  const post = vi.fn(async () => view);
  const request = vi.fn(async () => view);
  const del = vi.fn(async () => view);
  // The bot settings also read the computers (no docker here) and the tools (none).
  const computers = { default: "local", local: { available: true }, host: { available: false }, docker: { available: false, build: { state: "idle" } } };
  const get = vi.fn(async (path: string) => (path.includes("computer") ? computers : []));
  return { api: { get, post, request, delete: del } as unknown as Api, post, request, del };
}

describe("the Squads screen", () => {
  it("creates a squad with a name, a description and its bots", async () => {
    const { api, post } = fakeApi();
    render(<SquadsScreen api={api} bots={[ana, bob, cai]} view={{ squads: [], roomId: null }} onOpenGroup={() => undefined} />);
    expect(screen.getByRole("heading", { name: "No squad yet" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New squad" })[0]!);
    const form = screen.getByTestId("squad-new");
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Growth" } });
    fireEvent.change(within(form).getByLabelText(/^Description/), { target: { value: "Grow the user base" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: /Ana/ }));
    fireEvent.click(within(form).getByRole("checkbox", { name: /Bob/ }));
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Create squad" })));
    expect(post).toHaveBeenCalledWith("/api/v1/squads", { name: "Growth", description: "Grow the user base", members: [ana.id, bob.id] });
  });

  it("shows the org chart and lets the user pick each squad's manager and representative, add and remove bots, and open its chat", async () => {
    const { api, post, request, del } = fakeApi();
    const onOpenGroup = vi.fn();
    render(<SquadsScreen api={api} bots={[ana, bob, cai, max, dan]} view={view} onOpenGroup={onOpenGroup} />);
    const chart = screen.getByRole("region", { name: "Org chart" });
    expect(within(chart).getByText("Max")).toBeTruthy();
    expect(within(chart).getByText("No manager")).toBeTruthy();
    expect(within(chart).getByText("★ Ana · bots: 2")).toBeTruthy();

    const card = screen.getByTestId("squad-growth");
    expect(within(card).getByText("@growth")).toBeTruthy();
    expect((within(card).getByLabelText(/^Manager/) as HTMLSelectElement).value).toBe(max.id);
    expect(within(card).getByText("★ Representative")).toBeTruthy();
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Make Bob the representative" })));
    expect(request).toHaveBeenCalledWith("PATCH", "/api/v1/squads/sqd_growth", { representativeId: bob.id });
    await act(async () => fireEvent.change(within(card).getByLabelText(/^Manager/), { target: { value: dan.id } }));
    expect(request).toHaveBeenCalledWith("PATCH", "/api/v1/squads/sqd_growth", { managerId: dan.id });
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Take Bob out of the squad" })));
    expect(del).toHaveBeenCalledWith("/api/v1/squads/sqd_growth/members/bot_bob");
    // A bot from another squad says where it is.
    expect(within(card).getByRole("option", { name: "Caio (in Data)" })).toBeTruthy();
    await act(async () => fireEvent.change(within(card).getByLabelText(/^Add a bot/), { target: { value: cai.id } }));
    expect(request).toHaveBeenCalledWith("PUT", `/api/v1/squads/sqd_growth/members/${cai.id}`);
    fireEvent.click(within(card).getByRole("button", { name: /Squad chat/ }));
    expect(onOpenGroup).toHaveBeenCalledWith("cnv_growth");
    expect(within(screen.getByTestId("squad-data")).getByText("The squad chat appears with 2 bots.")).toBeTruthy();

    // The bots in no squad, one manager for every squad, the room.
    await act(async () => fireEvent.change(screen.getByLabelText("Put Dan in…"), { target: { value: "sqd_data" } }));
    expect(request).toHaveBeenCalledWith("PUT", `/api/v1/squads/sqd_data/members/${dan.id}`);
    fireEvent.change(screen.getByLabelText("One manager for every squad"), { target: { value: max.id } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply to all" })));
    expect(post).toHaveBeenCalledWith("/api/v1/squads/manager", { managerId: max.id });
    fireEvent.click(screen.getByRole("button", { name: /Squads room/ }));
    expect(onOpenGroup).toHaveBeenCalledWith("cnv_room");
  });
});

describe("squads around the app", () => {
  it("filters the sidebar by squad, and marks each bot and squad chat with its squad's color", () => {
    const growthChat: Conversation = {
      id: "cnv_growth",
      kind: "group",
      title: "Growth",
      members: [ana.id, bob.id],
      leadBotId: ana.id,
      description: "",
      photo: null,
      muted: false,
      createdAt: "2026-10-03T10:00:00.000Z",
      lastItemAt: null,
    };
    const bots = Object.fromEntries([ana, bob, cai, max].map((b) => [b.id, b]));
    render(
      <Sidebar
        bots={bots}
        conversations={[growthChat]}
        approvals={[]}
        selectedBotId={null}
        selectedGroupId={null}
        view="chat"
        isUnread={() => false}
        onOpenBot={() => undefined}
        onOpenGroup={() => undefined}
        onNewBot={() => undefined}
        onNewGroup={() => undefined}
        onView={() => undefined}
        squads={view.squads}
      />,
    );
    const rows = () => screen.getAllByTestId(/^(bot|conv)-/).map((r) => r.dataset.testid);
    expect(rows()).toHaveLength(5);
    expect(within(screen.getByTestId("bot-ana")).getByLabelText("Growth")).toBeTruthy();
    const filter = screen.getByRole("group", { name: "Filter by squad" });
    fireEvent.click(within(filter).getByRole("button", { name: "Growth" }));
    expect(rows().sort()).toEqual(["bot-ana", "bot-bob", "conv-cnv_growth"]);
    fireEvent.click(within(filter).getByRole("button", { name: "No squad" }));
    expect(rows()).toEqual(["bot-max"]);
    expect(localStorage.getItem("orbis.squadFilter")).toBe("none");
  });

  it("puts a bot in a squad from its settings, where the squad decides who it reports to", async () => {
    const { api, request, del } = fakeApi();
    const onSave = vi.fn(async (_patch: object) => undefined);
    const { unmount } = render(
      <BotSettings
        api={api}
        bot={bob}
        bots={[ana, bob, max]}
        squads={view.squads}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    const panel = screen.getByTestId("settings-panel");
    expect((within(panel).getByLabelText("Squad") as HTMLSelectElement).value).toBe("sqd_growth");
    const reports = within(panel).getByLabelText(/^Reports to/) as HTMLSelectElement;
    expect(reports.disabled).toBe(true);
    expect(reports.value).toBe(ana.id);
    expect(within(panel).getByText(/Set by the squad/)).toBeTruthy();
    await act(async () => fireEvent.change(within(panel).getByLabelText("Squad"), { target: { value: "sqd_data" } }));
    expect(request).toHaveBeenCalledWith("PUT", "/api/v1/squads/sqd_data/members/bot_bob");
    await act(async () => fireEvent.change(within(panel).getByLabelText("Squad"), { target: { value: "" } }));
    expect(del).toHaveBeenCalledWith("/api/v1/squads/sqd_growth/members/bot_bob");
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty("reportsTo");
    unmount();
  });

  it("shows how other bots call an enabled routine, and who called it last", () => {
    act(() => useStore.setState({ bots: { [ana.id]: ana, [max.id]: max } }));
    const routine: Routine = {
      id: "rtn_1",
      botId: ana.id,
      name: "Weekly report",
      trigger: { type: "cron", cron: "0 9 * * 1", timezone: "UTC" },
      instruction: "Build the report",
      approval: "normal",
      enabled: true,
      paused: false,
      webhookPath: null,
      nextRunAt: null,
      lastRun: {
        id: "rrn_1",
        routineId: "rtn_1",
        runId: "run_1",
        test: false,
        status: "done",
        summary: null,
        startedAt: "2026-10-03T10:00:00.000Z",
        calledBy: max.id,
      },
      createdAt: "2026-10-03T10:00:00.000Z",
      updatedAt: "2026-10-03T10:00:00.000Z",
    };
    render(
      <RoutinesPanel
        bot={ana}
        routines={[routine]}
        onLoad={async () => undefined}
        onCreate={async () => ({ ...routine, secret: "" })}
        onAction={async () => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/called by Max/)).toBeTruthy();
    expect(screen.getByText("@ana/Weekly report")).toBeTruthy();
  });
});
