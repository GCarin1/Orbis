// specs/web-app — opening the conversation of a desktop notification.
import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { Conversation } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { useStore } from "../src/store.js";

const conv = (id: string, kind: "direct" | "group", members: string[]): Conversation => ({ id, kind, title: id, members, leadBotId: members[0] ?? null, createdAt: "2026-09-27T10:00:00.000Z", lastItemAt: null });

describe("desktop notification clicks", () => {
  it("open a group, or the direct conversation's bot", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/api/v1/conversations/cnv_group") return conv("cnv_group", "group", ["bot_ana", "bot_bob"]);
      if (path === "/api/v1/conversations/cnv_ana") return conv("cnv_ana", "direct", ["bot_ana"]);
      if (path === "/api/v1/bots/bot_ana/conversation") return conv("cnv_ana", "direct", ["bot_ana"]);
      return [];
    });
    act(() => useStore.getState().setApi({ get, post: vi.fn(async () => ({})) } as unknown as Api));
    await act(async () => useStore.getState().openConversation("cnv_group"));
    expect(useStore.getState()).toMatchObject({ selectedGroupId: "cnv_group", selectedBotId: null });
    await act(async () => useStore.getState().openConversation("cnv_ana"));
    expect(useStore.getState()).toMatchObject({ selectedBotId: "bot_ana", selectedGroupId: null });
  });
});
