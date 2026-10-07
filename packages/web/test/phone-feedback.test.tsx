// specs/web-app — the owner's phone feedback (change 0055): a bot's header with a ⋮ menu, routines read and
// picked in words with a "not tested yet" choice in the user's language, routine cards told the same way, and
// bots offered as choices with their role.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Routine, TimelineItem } from "@orbis/shared";
import { ApiError } from "../src/api.js";
import { botLabel } from "../src/components/Avatar.js";
import { BotHeader } from "../src/components/BotHeader.js";
import { RoutineCard } from "../src/components/Cards.js";
import { RoutinesPanel } from "../src/components/RoutinesPanel.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

const camila = bot({ name: "Camila", role: "Gerente de Investimentos", brain: { kind: "claude-code" } });
const rafael = bot({ name: "Rafael", role: "Analista", reportsTo: camila.id });

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  act(() => useStore.setState({ bots: { [camila.id]: camila, [rafael.id]: rafael } }));
});

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: "rtn_1",
  botId: rafael.id,
  name: "Market open",
  trigger: { type: "cron", cron: "23 7 * * 1-5", timezone: "America/Sao_Paulo" },
  instruction: "Sum up the market news",
  approval: "normal",
  enabled: false,
  paused: false,
  webhookPath: null,
  nextRunAt: null,
  lastRun: null,
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:00:00.000Z",
  ...over,
});

describe("a bot's header", () => {
  it("shows the bot's name and role and keeps every option in the ⋮ menu", () => {
    const onPanel = vi.fn();
    const onClear = vi.fn();
    render(<BotHeader bot={camila} computerRunning onBack={() => undefined} onPanel={onPanel} onClear={onClear} />);
    expect(screen.getByRole("heading", { name: "Camila @camila" })).toBeTruthy();
    expect(screen.getByText("Gerente de Investimentos")).toBeTruthy();
    // No row of icons: one menu button.
    expect(screen.queryByRole("button", { name: "Routines" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bot options" }));
    const menu = screen.getByRole("menu", { name: "Bot options" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Details", "Files", "Routines", "Computeron", "Bot settings", "Clear conversation"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Routines" }));
    expect(onPanel).toHaveBeenCalledWith("routines");
    expect(screen.queryByRole("menu")).toBeNull();
    // The face and the name open the details.
    fireEvent.click(screen.getByTestId("bot-title"));
    expect(onPanel).toHaveBeenLastCalledWith("details");
    fireEvent.click(screen.getByRole("button", { name: "Bot options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear conversation" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("the routines panel", () => {
  it("says when a routine runs, and offers to test or enable anyway when it was never tested", async () => {
    const onAction = vi.fn(async (_r: Routine, action: string, force?: boolean) => {
      if (action === "enable" && !force) throw new ApiError(409, { error: { code: "untested", message: 'routine "Market open" has no successful test run' } });
    });
    render(
      <RoutinesPanel
        bot={rafael}
        routines={[routine()]}
        onLoad={async () => undefined}
        onCreate={async () => ({ ...routine(), secret: "" })}
        onAction={onAction}
        onClose={() => undefined}
      />,
    );
    const row = screen.getByTestId("routine-rtn_1");
    expect(within(row).getByTestId("routine-when").textContent).toMatch(/Weekdays \(Mon to Fri\) at 07:23/);
    expect(within(row).queryByText(/23 7 \* \* 1-5/)).toBeNull();
    await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Enable" })));
    // The hub's English refusal becomes a choice in the user's language.
    expect(within(row).getByRole("status").textContent).toMatch(/has not been tested yet/);
    expect(within(row).queryByText(/no successful test run/)).toBeNull();
    await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Enable without a test" })));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: "rtn_1" }), "enable", true);
  });

  it("picks a weekly schedule by days and time, reads it back, and sends its cron", async () => {
    const onCreate = vi.fn(async (input: { name: string }) => ({ ...routine({ name: input.name }), secret: "" }));
    render(<RoutinesPanel bot={rafael} routines={[]} onLoad={async () => undefined} onCreate={onCreate} onAction={async () => undefined} onClose={() => undefined} />);
    const panel = screen.getByTestId("routines-panel");
    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "Weekly review" } });
    fireEvent.change(within(panel).getByLabelText("What to do"), { target: { value: "Review the week" } });
    fireEvent.change(within(panel).getByLabelText("When"), { target: { value: "weekly" } });
    // Monday is picked by default; add Friday.
    fireEvent.click(within(panel).getByRole("button", { name: "Fri" }));
    fireEvent.change(within(panel).getByLabelText("Time"), { target: { value: "18:00" } });
    fireEvent.change(within(panel).getByLabelText("Timezone"), { target: { value: "America/Sao_Paulo" } });
    expect(within(panel).getByTestId("routine-preview").textContent).toMatch(/Every week — Monday and Friday, at 06:00 PM/);
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Create routine" })));
    expect(onCreate).toHaveBeenCalledWith({
      name: "Weekly review",
      instruction: "Review the week",
      trigger: { type: "cron", cron: "0 18 * * 1,5", timezone: "America/Sao_Paulo" },
      approval: "normal",
    });
  });
});

describe("routine cards and bot choices", () => {
  it("tells a routine card in the user's language, with whose routine it is and when it runs", () => {
    const item: TimelineItem = {
      id: "itm_1",
      conversationId: "cnv_camila",
      kind: "card",
      author: { type: "system", id: null },
      text: 'Routine "Market open" of @rafael created (cron "23 7 * * 1-5" in America/Sao_Paulo). Test it, then enable it.',
      runId: null,
      parentId: null,
      mentions: [],
      attachments: [],
      reactions: {},
      card: { type: "routine", state: "created", data: { routineId: "rtn_1", botId: rafael.id, name: "Market open", trigger: routine().trigger, approval: "normal", event: "created" } },
      createdAt: "2026-10-04T10:00:00.000Z",
      updatedAt: "2026-10-04T10:00:00.000Z",
    };
    act(() => useLang.getState().setLang("pt-BR"));
    render(<RoutineCard item={item} bots={{ [rafael.id]: rafael }} />);
    const card = screen.getByTestId("routine-card");
    expect(card.textContent).toMatch(/Rotina “Market open” de Rafael/);
    expect(card.textContent).toMatch(/Dias úteis \(seg a sex\) às 07:23/);
    expect(card.textContent).toMatch(/teste e ative em Rotinas/);
    expect(card.textContent).not.toMatch(/Test it, then enable it/);
  });

  it("offers a bot as a choice with its role", () => {
    expect(botLabel(camila)).toBe("Camila · Gerente de Investimentos");
    expect(botLabel(bot({ name: "Solo" }))).toBe("Solo");
  });
});
