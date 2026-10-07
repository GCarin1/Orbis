// specs/web-app — a bot's initiative (change 0060-bot-initiative): the bot's switch, how often and its MCP
// updates go with the settings' Save and "Try it now" gives it its chance; Settings → Initiative switches
// every bot and sets the quiet hours in the user's timezone; a message the bot wrote on its own says so.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { InitiativeSettings, Run, TimelineItem } from "@orbis/shared";
import { Api } from "../src/api.js";
import { BotSettings } from "../src/components/BotSettings.js";
import { InitiativeSettingsTab } from "../src/components/InitiativeSettings.js";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("a bot's initiative in its settings", () => {
  it("is off until turned on; how often and its MCP updates go with Save; Try it now gives it its chance", async () => {
    const api = new Api("tok");
    const post = vi.spyOn(api, "post").mockResolvedValue({} as never);
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana", initiative: { enabled: false, frequency: "normal", mcpUpdates: true } });
    render(<BotSettings api={api} bot={ana} onSave={onSave} onExport={async () => undefined} onDuplicate={async () => undefined} onDelete={async () => undefined} onClose={() => undefined} />);
    const fields = screen.getByTestId("bot-initiative");
    const frequency = within(fields).getByLabelText("How often") as HTMLSelectElement;
    expect(frequency.disabled).toBe(true);
    fireEvent.click(within(fields).getByLabelText("Ana may write to me on its own"));
    expect(frequency.disabled).toBe(false);
    fireEvent.change(frequency, { target: { value: "often" } });
    fireEvent.click(within(fields).getByLabelText("Tell me about its MCP servers' updates"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ initiative: { enabled: true, frequency: "often", mcpUpdates: false } }));

    await act(async () => fireEvent.click(within(fields).getByRole("button", { name: "Try it now" })));
    expect(post).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/initiative/now`);
    expect(within(fields).getByRole("status").textContent).toContain("Ana is thinking of what to say");
  });
});

describe("Settings → Initiative", () => {
  it("switches every bot and saves the quiet hours with the device's timezone", async () => {
    const api = new Api("tok");
    const saved: InitiativeSettings = { enabled: true, quietStart: "22:00", quietEnd: "08:00", timezone: "UTC" };
    vi.spyOn(api, "get").mockResolvedValue(saved as never);
    const put = vi.spyOn(api, "put").mockImplementation(async (_path, body) => ({ ...saved, ...(body as object) }) as never);
    render(<InitiativeSettingsTab api={api} />);
    await waitFor(() => expect(screen.getByTestId("initiative-settings")).toBeTruthy());
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await act(async () => fireEvent.click(screen.getByLabelText("Bots may write to me on their own")));
    expect(put).toHaveBeenLastCalledWith("/api/v1/initiative", { enabled: false, timezone: zone });
    await act(async () => fireEvent.change(screen.getByLabelText("From"), { target: { value: "23:30" } }));
    expect(put).toHaveBeenLastCalledWith("/api/v1/initiative", { quietStart: "23:30", timezone: zone });
  });
});

describe("a message written on the bot's own initiative", () => {
  it("says so above the bubble", () => {
    const ana = bot({ name: "Ana" });
    const run = { id: "run_1", botId: ana.id, conversationId: "cnv_1", trigger: { type: "initiative", ref: "idle" }, status: "done", steps: [] } as unknown as Run;
    const item: TimelineItem = {
      id: "itm_1",
      conversationId: "cnv_1",
      kind: "message",
      author: { type: "bot", id: ana.id },
      text: "Posso revisar o relatório de ontem?",
      parentId: null,
      mentions: [],
      attachments: [],
      reactions: {},
      runId: "run_1",
      createdAt: "2026-10-07T10:00:00.000Z",
      updatedAt: "2026-10-07T10:00:00.000Z",
    };
    render(<Timeline items={[item]} bots={{ [ana.id]: ana }} runs={{ run_1: run }} activeRuns={[]} />);
    expect(screen.getByTestId("initiative-tag").textContent).toBe("💡 On its own initiative");
  });
});
