// specs/desktop-app — acceptance criterion 2 (native notifications).
import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@orbis/shared";
import { NotificationCenter } from "../src/notifications.js";

const ts = "2026-09-27T10:00:00.000Z";
const approval = (status = "pending"): StreamEvent => ({
  type: "approval.requested",
  ts,
  data: {
    approval: {
      id: "apr_1",
      runId: "run_1",
      botId: "bot_ana",
      conversationId: "cnv_ana",
      itemId: "itm_card",
      tool: "computer.shell",
      input: { command: "rm -rf build" },
      reason: "clean the build folder",
      status: status as "pending",
      decision: null,
      note: null,
      createdAt: ts,
      decidedAt: null,
    },
  },
});
const secretCard = (state: string, id = "itm_secret"): StreamEvent => ({
  type: "timeline.item",
  ts,
  data: {
    conversationId: "cnv_group",
    item: {
      id,
      conversationId: "cnv_group",
      kind: "card",
      author: { type: "bot", id: "bot_ana" },
      text: "Ana asks for the secret GITHUB_TOKEN",
      parentId: null,
      mentions: [],
      attachments: [],
      reactions: {},
      runId: "run_2",
      card: { type: "secret-request", state, data: { name: "GITHUB_TOKEN", reason: "open the release PR", botId: "bot_ana" } },
      createdAt: ts,
      updatedAt: ts,
    },
  },
});

describe("notifications", () => {
  it("maps an approval request and a secret request each to one notification targeting its conversation (criterion 2)", () => {
    const center = new NotificationCenter((id) => (id === "bot_ana" ? "Ana" : undefined));
    expect(center.fromEvent(approval())).toEqual({
      id: "apr_1",
      title: "Ana asks to use computer.shell",
      body: "clean the build folder",
      conversationId: "cnv_ana",
    });
    expect(center.fromEvent(approval())).toBeNull(); // once
    expect(center.fromEvent(secretCard("pending"))).toEqual({
      id: "itm_secret",
      title: "Ana asks for the secret GITHUB_TOKEN",
      body: "open the release PR",
      conversationId: "cnv_group",
    });
    // The card's later updates (fulfilled) and other events raise nothing.
    expect(center.fromEvent(secretCard("pending"))).toBeNull();
    expect(center.fromEvent(secretCard("fulfilled", "itm_other"))).toBeNull();
    expect(center.fromEvent(approval("approved"))).toBeNull();
    expect(center.fromEvent({ type: "bot.state", ts, data: { botId: "bot_ana", state: "working" } })).toBeNull();
  });
});
