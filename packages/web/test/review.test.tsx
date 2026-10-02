// The review of changes 0021 to 0027 (change 0028-review-of-the-audits): the
// chat's "new below" count, Try again on routine runs, steps kept on reload.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { TimelineItem } from "@orbis/shared";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import { keepSteps, useStore, type RunView } from "../src/store.js";
import type { Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana" });
const base = {
  conversationId: "cnv_1",
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
};
const message = (id: string, text: string): TimelineItem => ({ ...base, id, kind: "message", author: { type: "bot", id: ana.id }, text, runId: null });
const run = (id: string, status: RunView["status"], extra: Partial<RunView> = {}): RunView => ({
  id,
  botId: ana.id,
  conversationId: "cnv_1",
  trigger: { type: "message", ref: null },
  depth: 0,
  chainId: id,
  status,
  input: "x",
  skill: null,
  steps: [],
  reply: null,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscription: false },
  error: null,
  createdAt: base.createdAt,
  startedAt: null,
  finishedAt: null,
  ...extra,
});

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});
afterEach(() => {
  act(() => useStore.setState({ runs: {} }));
});

describe("reading history while bots work", () => {
  it("counts only new messages as new below, not a bot starting to work", () => {
    const view = (items: TimelineItem[], active: RunView[]) => (
      <div style={{ overflowY: "auto" }} data-testid="scroller">
        <Timeline items={items} bots={{ [ana.id]: ana }} runs={{}} activeRuns={active} />
      </div>
    );
    const first = [message("i1", "um")];
    const { rerender } = render(view(first, []));
    // The user scrolls up to read.
    const scroller = screen.getByTestId("scroller");
    Object.defineProperties(scroller, {
      scrollHeight: { value: 2000, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollTop: { value: 0, configurable: true, writable: true },
    });
    fireEvent.scroll(scroller);
    rerender(view(first, [run("run_1", "running")]));
    expect(screen.queryByTestId("new-below")).toBeNull();
    rerender(view([...first, message("i2", "dois")], []));
    expect(screen.getByTestId("new-below").textContent).toBe("↓ 1 new below");
  });
});

describe("trying a run again", () => {
  const failedEvent = (runId: string): TimelineItem => ({
    ...base,
    id: `e_${runId}`,
    kind: "event",
    author: { type: "system", id: null },
    text: "Ana: failed",
    runId,
    event: { type: "run.failed", data: { runId, botId: ana.id } },
  });

  it("offers no Try again on a routine's run, which is tested again from its routine", () => {
    const runs = { run_r: run("run_r", "failed", { trigger: { type: "routine", ref: "rtn_1" } }) };
    render(<Timeline items={[failedEvent("run_r")]} bots={{ [ana.id]: ana }} runs={runs} activeRuns={[]} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says why trying again did not work", async () => {
    const post = vi.fn(async () => {
      throw new Error("run run_x is done; only a failed or cancelled run can be tried again");
    });
    act(() => useStore.getState().setApi({ post } as unknown as Api));
    render(<Timeline items={[failedEvent("run_x")]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByText(/only a failed or cancelled run can be tried again/)).toBeTruthy();
  });
});

describe("reloading a conversation while a bot works", () => {
  it("keeps the steps that already streamed in when the hub's copy has fewer", () => {
    const step = { type: "tool_call" as const, at: base.createdAt, tool: "memory.search", callId: "c", input: {} };
    const streamed = run("run_1", "running", { steps: [step, step, step] });
    expect(keepSteps(run("run_1", "running", { steps: [step] }), streamed).steps).toHaveLength(3);
    expect(keepSteps(run("run_1", "done", { steps: [step, step, step, step] }), streamed).steps).toHaveLength(4);
    expect(keepSteps(run("run_2", "queued"), undefined).steps).toHaveLength(0);
  });
});
