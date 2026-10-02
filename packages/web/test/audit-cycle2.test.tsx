// Audit cycle 2 (change 0024-audit-cycle-2-web-app-state): the stream that
// went quiet, card errors, the approvals inbox and Markdown-free previews.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Approval, TimelineItem } from "@orbis/shared";
import { openStream, STREAM_PING_MS, STREAM_PONG_MS } from "../src/api.js";
import { ApprovalsInbox, approvalSummary } from "../src/components/ApprovalsInbox.js";
import { ApprovalCard } from "../src/components/Cards.js";
import { plainText } from "../src/components/Markdown.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import type { Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana" });

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A WebSocket that records what it sends and lets the test decide what arrives. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

describe("the event stream", () => {
  it("replaces a connection that stopped answering, and reloads what it missed", () => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    const status: boolean[] = [];
    const onReconnect = vi.fn();
    const stop = openStream("t", { onEvent: () => undefined, onStatus: (c) => status.push(c), onReconnect });
    FakeSocket.all[0]!.open();
    // A live connection answers the ping.
    vi.advanceTimersByTime(STREAM_PING_MS);
    expect(FakeSocket.all[0]!.sent.at(-1)).toBe('{"type":"ping"}');
    FakeSocket.all[0]!.onmessage!({ data: JSON.stringify({ type: "pong", data: {}, ts: "" }) });
    vi.advanceTimersByTime(STREAM_PONG_MS);
    expect(status).toEqual([true]);
    // A dead one does not: it is closed and replaced.
    vi.advanceTimersByTime(STREAM_PING_MS - STREAM_PONG_MS);
    vi.advanceTimersByTime(STREAM_PONG_MS);
    expect(status).toEqual([true, false]);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.open();
    expect(onReconnect).toHaveBeenCalledOnce();
    stop();
  });
});

describe("cards and the inbox", () => {
  const approval: Approval = {
    id: "apr_1",
    runId: "run_1",
    botId: ana.id,
    conversationId: "cnv_group",
    itemId: "i1",
    tool: "computer.shell",
    input: { claudeTool: "Bash", input: { command: "npm   run build" } },
    reason: null,
    status: "pending",
    decision: null,
    note: null,
    createdAt: "2026-10-02T10:00:00.000Z",
    decidedAt: null,
  };

  it("says why an answer was refused and shows the approval as the hub has it now", async () => {
    const post = vi.fn(async () => {
      throw new Error("approval apr_1 is already expired");
    });
    const get = vi.fn(async () => ({ ...approval, status: "expired" }));
    act(() => useStore.getState().setApi({ post, get } as unknown as Api));
    const item: TimelineItem = {
      id: "i1",
      conversationId: "cnv_group",
      kind: "card",
      author: { type: "bot", id: ana.id },
      text: "",
      parentId: null,
      mentions: [],
      attachments: [],
      reactions: {},
      runId: "run_1",
      card: { type: "approval", state: "pending", data: { approvalId: "apr_1", botId: ana.id, tool: "computer.shell", input: {}, reason: null } },
      createdAt: approval.createdAt,
      updatedAt: approval.createdAt,
    };
    render(<ApprovalCard item={item} bot={ana} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Allow once" })));
    expect(screen.getByText("approval apr_1 is already expired")).toBeTruthy();
    expect(useStore.getState().approvals.apr_1!.status).toBe("expired");
  });

  it("says in the inbox what each approval would do, and opens the conversation it waits in", () => {
    const onOpen = vi.fn();
    render(<ApprovalsInbox approvals={[approval]} bots={{ [ana.id]: ana }} onOpen={onOpen} />);
    expect(screen.getByTestId("inbox-what").textContent).toBe("npm run build");
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(onOpen).toHaveBeenCalledWith(approval);
    expect(approvalSummary({ url: "https://example.com" })).toBe("https://example.com");
    expect(approvalSummary({ a: 1 })).toBe('{"a":1}');
  });
});

describe("previews and reading aloud", () => {
  it("drops Markdown marks, keeping the words", () => {
    expect(plainText("## Preços\n- **lápis**: `R$ 1`\n- [loja](https://x.com) e _caneta_\n\n```\nnpm test\n```")).toBe(
      "Preços\nlápis: R$ 1\nloja e caneta\n\nnpm test",
    );
    expect(plainText("snake_case_name stays")).toBe("snake_case_name stays");
  });
});
