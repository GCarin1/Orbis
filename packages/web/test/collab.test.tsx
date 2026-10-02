// specs/web-app — groups in the sidebar, the group dialog and handoff cards.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation, TimelineItem } from "@orbis/shared";
import { NewGroupDialog } from "../src/components/Groups.js";
import { Sidebar } from "../src/components/Sidebar.js";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA" });
const bob = bot({ name: "Bob", role: "Engineering" });
const cara = bot({ name: "Cara" });
const bots = { [ana.id]: ana, [bob.id]: bob, [cara.id]: cara };

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("groups in the sidebar", () => {
  it("lists groups with their members and selects one", () => {
    const group: Conversation = { id: "cnv_g", kind: "group", title: "Release", members: [ana.id, bob.id], leadBotId: bob.id, description: "", photo: null, muted: false, createdAt: "2026-09-27T10:00:00.000Z", lastItemAt: null };
    const onSelect = vi.fn();
    render(
      <Sidebar
        bots={bots}
        conversations={[group]}
        approvals={[]}
        selectedBotId={null}
        selectedGroupId={null}
        view="chat"
        isUnread={() => false}
        onOpenBot={() => undefined}
        onOpenGroup={onSelect}
        onNewBot={() => undefined}
        onNewGroup={() => undefined}
        onView={() => undefined}
      />,
    );
    const item = screen.getByTestId("conv-cnv_g");
    expect(item.textContent).toContain("Release");
    expect(item.textContent).toContain("Ana, Bob");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("cnv_g");
  });

  it("creates a group of the chosen bots with a lead, only between 2 and 6 members", async () => {
    const onCreate = vi.fn(async () => undefined);
    render(<NewGroupDialog bots={[ana, bob, cara]} onCreate={onCreate} onCancel={() => undefined} />);
    const create = screen.getByRole("button", { name: "Create group" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Release" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Ana/ }));
    expect(create.disabled).toBe(true); // one member is not a group
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(create.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Lead/), { target: { value: bob.id } });
    await act(async () => {
      fireEvent.click(create);
    });
    expect(onCreate).toHaveBeenCalledWith({ title: "Release", members: [ana.id, bob.id], leadBotId: bob.id });
  });

  it("stops at six members", () => {
    const many = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"].map((name) => bot({ name }));
    render(<NewGroupDialog bots={many} onCreate={async () => undefined} onCancel={() => undefined} />);
    for (const b of many.slice(0, 6)) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(b.name) }));
    expect((screen.getByRole("checkbox", { name: /G7/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/6 of 6 chosen/)).toBeTruthy();
  });
});

describe("handoff cards", () => {
  const base = { conversationId: "cnv_1", mentions: [], attachments: [], reactions: {}, createdAt: "2026-09-27T10:00:00.000Z", updatedAt: "2026-09-27T10:00:00.000Z" };
  const card: TimelineItem = {
    ...base,
    id: "itm_card",
    parentId: null,
    kind: "card",
    author: { type: "bot", id: ana.id },
    text: "@ana → @bob: check the logs",
    runId: "run_1",
    card: { type: "handoff", state: "running", data: { from: ana.id, to: bob.id, task: "check the logs", context: "deploy 42", returnResult: true, receiverRunId: "run_2" } },
  };
  const reply: TimelineItem = { ...base, id: "itm_reply", parentId: "itm_card", kind: "message", author: { type: "bot", id: bob.id }, text: "logs are clean", runId: "run_2" };

  it("shows who handed what to whom, its state and context, and threads the reply under it", () => {
    render(<Timeline items={[card, reply]} bots={bots} runs={{}} activeRuns={[]} />);
    const view = screen.getByTestId("handoff-card");
    expect(view.textContent).toContain("@ana handed a task to @bob");
    expect(within(view).getByText("In progress")).toBeTruthy();
    expect(within(view).getByText("check the logs")).toBeTruthy();
    expect(within(view).getByText("deploy 42")).toBeTruthy();
    expect(view.textContent).toContain("The answer goes back to @ana.");
    expect(screen.getByTestId("reply-to").textContent).toContain("replying to @ana → @bob: check the logs");
  });

  it("shows the error of a failed handoff", () => {
    const failed = { ...card, card: { ...card.card!, state: "failed", data: { ...card.card!.data, error: "the bot was deleted" } } };
    render(<Timeline items={[failed]} bots={bots} runs={{}} activeRuns={[]} />);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("the bot was deleted")).toBeTruthy();
  });
});
