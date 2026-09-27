// specs/web-app — acceptance criterion 1.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Roster, groupRoster } from "../src/components/Roster.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

describe("roster", () => {
  it("renders pinned bots first, groups the rest by role, and labels each state (criterion 1)", () => {
    useLang.getState().setLang("en");
    const bots = [
      bot({ name: "Zed", role: "Engineering", state: "working" }),
      bot({ name: "Ana", role: "QA", state: "waiting", lastMessage: { text: "Deploy checklist passed", at: "2026-09-27T09:00:00.000Z" } }),
      bot({ name: "Chief", role: "Operations", pinned: true, state: "done" }),
      bot({ name: "Ghost", role: "QA", hidden: true }),
      bot({ name: "Loner", state: "blocked" }),
    ];
    const onSelect = vi.fn();
    render(<Roster bots={bots} selectedId={null} onSelect={onSelect} onNew={() => undefined} />);

    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Pinned", "Engineering", "QA", "No role"]);
    expect(within(screen.getByTestId("group-__pinned")).getByText("Chief")).toBeTruthy();
    expect(screen.queryByText("Ghost")).toBeNull();

    // The state is stated as text next to the color, for accessibility.
    expect(within(screen.getByTestId("bot-ana")).getByText(/Waiting for you/)).toBeTruthy();
    expect(within(screen.getByTestId("bot-zed")).getByText(/Working/)).toBeTruthy();
    expect(within(screen.getByTestId("bot-loner")).getByText(/Blocked/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Chief: Done" })).toBeTruthy();
    expect(screen.getByText("Deploy checklist passed")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bot-ana"));
    expect(onSelect).toHaveBeenCalledWith("bot_ana");
  });

  it("orders bots inside a group by most recent activity", () => {
    const groups = groupRoster(
      [
        bot({ name: "Old", role: "QA", lastMessage: { text: "a", at: "2026-09-01T00:00:00.000Z" } }),
        bot({ name: "New", role: "QA", lastMessage: { text: "b", at: "2026-09-27T00:00:00.000Z" } }),
        bot({ name: "Never", role: "QA" }),
      ],
      { pinned: "P", noRole: "N" },
    );
    expect(groups[0]!.bots.map((b) => b.name)).toEqual(["New", "Old", "Never"]);
  });
});
