// specs/web-app — acceptance criterion 2.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Approval, TimelineItem } from "@orbis/shared";
import { Timeline } from "../src/components/Timeline.js";
import { ApprovalsInbox } from "../src/components/ApprovalsInbox.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import type { Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA" });
const base = { conversationId: "cnv_1", parentId: null, mentions: [], attachments: [], reactions: {}, createdAt: "2026-09-27T10:00:00.000Z", updatedAt: "2026-09-27T10:00:00.000Z" };

const items: TimelineItem[] = [
  { ...base, id: "i1", kind: "message", author: { type: "user", id: null }, text: "please clean the build", runId: null },
  { ...base, id: "i2", kind: "event", author: { type: "system", id: null }, text: "Routine daily-report created", runId: null, event: { type: "routine.created", data: {} } },
  {
    ...base,
    id: "i3",
    kind: "card",
    author: { type: "bot", id: ana.id },
    text: "Ana asks to use computer.shell",
    runId: "run_1",
    card: { type: "approval", state: "pending", data: { approvalId: "apr_1", botId: ana.id, tool: "computer.shell", input: { command: "rm -rf build" }, reason: null } },
  },
  {
    ...base,
    id: "i4",
    kind: "card",
    author: { type: "bot", id: ana.id },
    text: "Ana drafted an email",
    runId: "run_1",
    card: { type: "draft", state: "pending", data: { channel: "email", to: "cto@example.com", subject: "QA", body: "All green", botId: ana.id } },
  },
];

function fakeApi() {
  const post = vi.fn(async (path: string, body?: unknown) => {
    if (path.startsWith("/api/v1/approvals/")) return { id: "apr_1", status: "approved", decision: (body as { decision: string }).decision };
    return { ...items[3], card: { ...items[3]!.card!, state: "sent" } };
  });
  const api = { post, get: vi.fn(), patch: vi.fn(), delete: vi.fn(), request: vi.fn() } as unknown as Api;
  return { api, post };
}

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("timeline", () => {
  it("renders a message, an event and an approval card; Allow once calls the approvals API (criterion 2)", async () => {
    const { api, post } = fakeApi();
    act(() => useStore.getState().setApi(api));
    render(<Timeline items={items} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);

    expect(screen.getByText("please clean the build")).toBeTruthy();
    expect(screen.getByTestId("event").textContent).toBe("Routine daily-report created");
    const card = screen.getByTestId("approval-card");
    expect(card.textContent).toContain("Ana wants to use computer.shell");
    expect(card.textContent).toContain("rm -rf build");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/approvals/apr_1", { decision: "allow_once" });
  });

  it("denies with the typed note", async () => {
    const { api, post } = fakeApi();
    act(() => useStore.getState().setApi(api));
    render(<Timeline items={items} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    fireEvent.change(screen.getByLabelText("Note for the bot (optional)"), { target: { value: "use make clean" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/approvals/apr_1", { decision: "deny", note: "use make clean" });
  });

  it("sends an edited draft and discards another", async () => {
    const { api, post } = fakeApi();
    act(() => useStore.getState().setApi(api));
    render(<Timeline items={items} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    const draft = screen.getByTestId("draft-card");
    expect(draft.textContent).toContain("Draft — nothing was sent");
    fireEvent.change(screen.getByDisplayValue("All green"), { target: { value: "All green, 212 tests" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/cards/i4/send", { fields: { to: "cto@example.com", body: "All green, 212 tests", subject: "QA" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/cards/i4/discard");
  });

  it("lists pending approvals in the inbox", async () => {
    const { api, post } = fakeApi();
    act(() => useStore.getState().setApi(api));
    const approval: Approval = {
      id: "apr_9", runId: "run_9", botId: ana.id, conversationId: "cnv_1", itemId: "i3", tool: "routine.create", input: {},
      reason: null, status: "pending", decision: null, note: null, createdAt: base.createdAt, decidedAt: null,
    };
    const onOpen = vi.fn();
    render(<ApprovalsInbox approvals={[approval, { ...approval, id: "apr_old", status: "approved" }]} bots={{ [ana.id]: ana }} onOpen={onOpen} />);
    expect(screen.getAllByTestId("inbox-item")).toHaveLength(1);
    expect(screen.getByText("routine.create")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    });
    expect(post).toHaveBeenCalledWith("/api/v1/approvals/apr_9", { decision: "allow_once" });
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(onOpen).toHaveBeenCalledWith(ana.id);
  });
});
