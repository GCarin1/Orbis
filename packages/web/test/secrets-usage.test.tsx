// specs/web-app — the secret-request card and the usage screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TimelineItem, UsageReport } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { Timeline } from "../src/components/Timeline.js";
import { UsageScreen } from "../src/components/UsageScreen.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA" });
const bob = bot({ name: "Bob" });

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const card = (state: string): TimelineItem => ({
  id: "itm_s",
  conversationId: "cnv_1",
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  createdAt: "2026-09-27T10:00:00.000Z",
  updatedAt: "2026-09-27T10:00:00.000Z",
  kind: "card",
  author: { type: "bot", id: ana.id },
  text: "Ana asks for the secret GITHUB_TOKEN: open the release PR",
  runId: "run_1",
  card: { type: "secret-request", state, data: { name: "GITHUB_TOKEN", reason: "open the release PR", botId: ana.id } },
});

describe("secret-request card", () => {
  it("takes the value in a masked field and posts it to the vault route; Decline declines", async () => {
    const post = vi.fn(async (_path: string, body: unknown) => ({ ...card((body as { decline?: boolean }).decline ? "declined" : "fulfilled") }));
    act(() => useStore.getState().setApi({ post, get: vi.fn() } as unknown as Api));
    render(<Timeline items={[card("pending")]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    const view = screen.getByTestId("secret-card");
    expect(view.textContent).toContain("Ana asks for the secret GITHUB_TOKEN");
    expect(view.textContent).toContain("the bot only uses {{secret:GITHUB_TOKEN}} and never sees it");
    const field = within(view).getByLabelText("value (hidden)") as HTMLInputElement;
    expect(field.type).toBe("password");
    fireEvent.change(field, { target: { value: "ghp_123" } });
    await act(async () => fireEvent.click(within(view).getByRole("button", { name: "Store in the vault" })));
    expect(post).toHaveBeenCalledWith("/api/v1/cards/itm_s/secret", { value: "ghp_123" });
    await act(async () => fireEvent.click(within(view).getByRole("button", { name: "Decline" })));
    expect(post).toHaveBeenLastCalledWith("/api/v1/cards/itm_s/secret", { decline: true });
  });

  it("shows no field once answered", () => {
    render(<Timeline items={[card("fulfilled")]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    expect(screen.getByText("Stored")).toBeTruthy();
    expect(screen.queryByLabelText("value (hidden)")).toBeNull();
  });
});

describe("usage screen", () => {
  it("shows runs, tokens and cost per bot, the subscription part and the cap (criterion 11)", async () => {
    const report: UsageReport = {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
      total: { runs: 5, inputTokens: 12_500, outputTokens: 3_000, cachedTokens: 0, costUsd: 3.5, subscriptionCostUsd: 2 },
      bots: [
        { botId: ana.id, usage: { runs: 3, inputTokens: 10_000, outputTokens: 2_000, cachedTokens: 0, costUsd: 3, subscriptionCostUsd: 2 }, spendCapUsd: 1, capIncludesSubscription: false, cappedCostUsd: 1 },
        { botId: bob.id, usage: { runs: 2, inputTokens: 2_500, outputTokens: 1_000, cachedTokens: 0, costUsd: 0.5, subscriptionCostUsd: 0 }, spendCapUsd: null, capIncludesSubscription: false, cappedCostUsd: 0.5 },
      ],
    };
    const get = vi.fn(async (_path: string) => report);
    render(<UsageScreen api={{ get } as unknown as Api} bots={{ [ana.id]: ana, [bob.id]: bob }} />);
    await waitFor(() => expect(screen.getByTestId("usage-ana")).toBeTruthy());
    const anaRow = screen.getByTestId("usage-ana");
    expect(anaRow.textContent).toContain("10.0k / 2.0k");
    expect(anaRow.textContent).toContain("$3.00");
    expect(anaRow.textContent).toContain("$2.00");
    expect(anaRow.textContent).toContain("$1.00 / $1.00");
    expect(anaRow.textContent).toContain("reached");
    expect(within(anaRow).getByRole("meter").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByTestId("usage-bob").textContent).toContain("no cap");
    expect(get.mock.calls[0]![0]).toMatch(/^\/api\/v1\/usage\?from=/);
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
