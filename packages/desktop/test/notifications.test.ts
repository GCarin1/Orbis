// specs/desktop-app — acceptance criterion 2 (native notifications).
import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@orbis/shared";
import { mutedConversations, NotificationCenter } from "../src/notifications.js";

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

  it("raises one notification when a manager reports back on its own", () => {
    const center = new NotificationCenter((id) => (id === "bot_chief" ? "Chief" : undefined));
    const report: StreamEvent = {
      type: "bot.report",
      ts,
      data: { botId: "bot_chief", conversationId: "cnv_chief", itemId: "itm_report", text: "Done: the banner is ready and QA found 3 bugs." },
    };
    expect(center.fromEvent(report)).toEqual({
      id: "itm_report",
      title: "Chief reported back",
      body: "Done: the banner is ready and QA found 3 bugs.",
      conversationId: "cnv_chief",
    });
    expect(center.fromEvent(report)).toBeNull();
  });

  it("raises none for a report in a muted group, and still asks for an approval there (change 0042)", () => {
    const muted = mutedConversations();
    const group = {
      id: "cnv_ana",
      kind: "group" as const,
      title: "Time",
      members: ["bot_ana"],
      leadBotId: "bot_ana",
      description: "",
      photo: null,
      muted: false,
      createdAt: ts,
      lastItemAt: null,
    };
    muted.set([group]);
    const center = new NotificationCenter(
      () => "Ana",
      (id) => muted.has(id),
    );
    const report = (itemId: string): StreamEvent => ({
      type: "bot.report",
      ts,
      data: { botId: "bot_ana", conversationId: "cnv_ana", itemId, text: "Pronto." },
    });
    expect(center.fromEvent(report("itm_1"))).not.toBeNull();
    muted.apply({ type: "conversation.updated", ts, data: { conversation: { ...group, muted: true } } });
    expect(center.fromEvent(report("itm_2"))).toBeNull();
    expect(center.fromEvent(approval())).toMatchObject({ conversationId: "cnv_ana" });
    muted.apply({ type: "conversation.deleted", ts, data: { conversationId: "cnv_ana" } });
    expect(center.fromEvent(report("itm_3"))).not.toBeNull();
  });
});
