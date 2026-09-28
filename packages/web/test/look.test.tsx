// specs/web-app — the Orbis look: faces with eyes that follow the state, the
// timeline's separators, "Messages from …" and mention chips, and the bot panel.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComputerStatus, Routine, TimelineItem } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { Avatar, BotFace, Mascot } from "../src/components/Avatar.js";
import { BotPanel, describeSchedule } from "../src/components/BotPanel.js";
import { Timeline } from "../src/components/Timeline.js";
import { translate, useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const chief = bot({ name: "Chief", role: "Chief of Staff", avatar: { initials: "CH", color: "#8b5cf6", shape: "orb" } });
const dana = bot({ name: "Dana", role: "Designer", reportsTo: chief.id, avatar: { initials: "DA", color: "#f59e0b", shape: "pill" } });
const quinn = bot({ name: "Quinn", role: "QA", reportsTo: chief.id, avatar: { initials: "QU", color: "#22c55e", shape: "square" } });
const bots = { [chief.id]: chief, [dana.id]: dana, [quinn.id]: quinn };

const item = (id: string, author: TimelineItem["author"], text: string, createdAt: string, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  id,
  conversationId: "cnv_chief",
  kind: "message",
  author,
  text,
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  runId: null,
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

describe("faces", () => {
  it("draws the shape in the bot's color with two eyes, the orb with its ring, happy eyes when done", () => {
    const { container, rerender } = render(<BotFace shape="orb" color="#8b5cf6" size={40} label="Chief: Idle" />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("face-orb")).toBe(true);
    expect(svg.classList.contains("state-idle")).toBe(true);
    expect(svg.querySelector("ellipse")).not.toBeNull(); // the orbit ring
    expect(svg.querySelectorAll(".eyes-open rect")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Chief: Idle" })).toBeTruthy();

    rerender(<BotFace shape="cloud" color="#ec4899" state="done" />);
    const done = container.querySelector("svg")!;
    expect(done.classList.contains("face-cloud")).toBe(true);
    expect(done.querySelector("ellipse")).toBeNull();
    expect(done.querySelectorAll(".eyes-happy path")).toHaveLength(2);
    expect(done.querySelector(".eyes-open")).toBeNull();
    expect(done.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the bot and its state, and paints the mascot with the brand gradient", () => {
    render(
      <>
        <Avatar bot={{ ...dana, state: "working" }} size={32} />
        <Mascot size={32} />
      </>,
    );
    const face = screen.getByRole("img", { name: "Dana: Working" });
    expect(face.classList.contains("state-working")).toBe(true);
    expect(document.querySelector("linearGradient")).not.toBeNull();
  });
});

describe("timeline", () => {
  it("separates pauses with the time, introduces colleagues once per stretch and colors mentions", () => {
    const items = [
      item("i1", { type: "user", id: null }, "ship the launch page", "2026-09-28T09:00:00.000Z"),
      item("i2", { type: "bot", id: chief.id }, "On it: @designer does the banner, @qa tests checkout.", "2026-09-28T09:01:00.000Z"),
      item("i3", { type: "bot", id: dana.id }, "Banner ready", "2026-09-28T09:40:00.000Z"),
      item("i4", { type: "bot", id: quinn.id }, "2 bugs filed", "2026-09-28T09:41:00.000Z", { reactions: { "👍": 2 } }),
      item("i5", { type: "bot", id: chief.id }, "All done.", "2026-09-28T09:42:00.000Z"),
    ];
    render(<Timeline items={items} bots={bots} runs={{}} activeRuns={[]} ownBotId={chief.id} />);
    const log = screen.getByRole("log");
    // Two stretches of time: 09:00 and, after a 39-minute pause, 09:40.
    expect(log.querySelectorAll(".time-sep")).toHaveLength(2);
    // Dana and Quinn speak in the chief's conversation: named once.
    const from = screen.getAllByTestId("messages-from");
    expect(from).toHaveLength(1);
    expect(from[0]!.textContent).toBe("Messages from Dana and Quinn");
    // The chief's own messages carry no name; colleagues' do.
    const messages = screen.getAllByTestId("message");
    expect(messages[1]!.classList.contains("own")).toBe(true);
    expect(within(messages[2]!).getByText("Dana", { selector: ".bubble-author" })).toBeTruthy();
    // Mentions by role show the bot's color and face.
    const mention = within(messages[1]!).getByText("@designer");
    expect(mention.classList.contains("mention")).toBe(true);
    expect((mention as HTMLElement).style.color).toBe("rgb(245, 158, 11)");
    expect(within(messages[3]!).getByText("👍 2")).toBeTruthy();
  });

  it("names every bot in a group conversation", () => {
    render(
      <Timeline items={[item("g1", { type: "bot", id: chief.id }, "hello", "2026-09-28T09:00:00.000Z")]} bots={bots} runs={{}} activeRuns={[]} ownBotId={null} />,
    );
    expect(screen.getByText("Chief", { selector: ".bubble-author" })).toBeTruthy();
    expect(screen.queryByTestId("messages-from")).toBeNull();
  });
});

describe("bot panel", () => {
  const routine = (name: string, cron: string, fields: Partial<Routine> = {}): Routine =>
    ({ id: `rtn_${name}`, botId: chief.id, name, trigger: { type: "cron", cron, timezone: "UTC" }, instruction: "x", approval: "normal", enabled: true, paused: false, webhookPath: null, nextRunAt: null, lastRun: null, createdAt: "", updatedAt: "", ...fields }) as Routine;

  it("shows the screen, the routines in words, the team and the brain, with a way into each", async () => {
    const onOpenComputer = vi.fn();
    const onOpenBot = vi.fn();
    const status = { botId: chief.id, enabled: true, provider: "local", status: "stopped", screenshotAt: null } as unknown as ComputerStatus;
    render(
      <BotPanel
        api={{ blob: vi.fn() } as unknown as Api}
        bot={chief}
        bots={bots}
        status={status}
        routines={[routine("Morning briefing", "0 8 * * *"), routine("Inbox cleanup", "0 18 * * 1-5"), routine("Weekly update", "0 9 * * 1", { paused: true })]}
        onLoadRoutines={async () => undefined}
        onOpenComputer={onOpenComputer}
        onOpenRoutines={() => undefined}
        onOpenSettings={() => undefined}
        onOpenBot={onOpenBot}
        onExport={async () => undefined}
        onClose={() => undefined}
      />,
    );
    const panel = screen.getByTestId("bot-panel");
    expect(panel.textContent).toContain("Chief's screen");
    expect(panel.textContent).toContain("Every day at 8:00 AM");
    expect(panel.textContent).toContain("Weekdays at 6:00 PM");
    expect(panel.textContent).toContain("Paused");
    expect(panel.textContent).toContain("Reports to no bot.");
    fireEvent.click(screen.getByRole("button", { name: /Dana/ }));
    expect(onOpenBot).toHaveBeenCalledWith(dana.id);
    fireEvent.click(screen.getByRole("button", { name: "Open Chief's computer" }));
    expect(onOpenComputer).toHaveBeenCalled();
    expect(panel.textContent).toContain("Mock (no AI)");
  });

  it("describes schedules in words and keeps the unusual ones as cron", () => {
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
    expect(describeSchedule(routine("a", "0 * * * *"), t, "en-US")).toBe("Every hour");
    expect(describeSchedule(routine("b", "30 9 * * 1"), t, "en-US")).toBe("Every Monday at 9:30 AM");
    expect(describeSchedule(routine("c", "*/15 * * * *"), t, "en-US")).toBe("*/15 * * * *");
    expect(describeSchedule({ ...routine("d", ""), trigger: { type: "webhook" } } as Routine, t, "en-US")).toBe("Signed webhook");
  });
});
