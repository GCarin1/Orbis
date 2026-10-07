// The chat deep audit (change 0022-chat-and-bot-deep-audit): Markdown replies,
// one bubble per busy bot with a stop button, "waiting for you", try again,
// earlier messages, and a message that could not be sent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TimelineItem } from "@orbis/shared";
import { Composer } from "../src/components/Composer.js";
import { Markdown } from "../src/components/Markdown.js";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import { useStore, type RunView } from "../src/store.js";
import type { Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA", avatar: { initials: "AN", color: "#e11d48", shape: "orb" } });
const base = {
  conversationId: "cnv_1",
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
};
const run = (id: string, status: RunView["status"]): RunView => ({
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
});

function fakeApi() {
  const post = vi.fn(async (path: string) => (path.endsWith("/retry") ? { ...run("run_new", "queued"), retryOf: "run_failed" } : { cancelled: true }));
  const get = vi.fn(async () => []);
  const api = { post, get, patch: vi.fn(), delete: vi.fn(), request: vi.fn() } as unknown as Api;
  act(() => useStore.getState().setApi(api));
  return { post, get };
}

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("Markdown replies", () => {
  it("renders lists, code, tables, links and emphasis, with mentions in the bot's color", () => {
    const text = [
      "## Resumo",
      "Preços para **@ana** revisar:",
      "- lápis: `R$ 1,50`",
      "- caneta: *R$ 3*",
      "",
      "| item | preço |",
      "| --- | --- |",
      "| borracha | R$ 2 |",
      "",
      "```sh",
      "npm test",
      "```",
      "Fonte: [loja](https://example.com/precos) e https://example.org.",
    ].join("\n");
    const { container } = render(<Markdown text={text} bots={[ana]} />);
    expect(container.querySelector(".md-h2")!.textContent).toBe("Resumo");
    expect(container.querySelector("strong .mention")!.textContent).toBe("@ana");
    expect([...container.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["lápis: R$ 1,50", "caneta: R$ 3"]);
    expect(container.querySelector("li code")!.textContent).toBe("R$ 1,50");
    expect(container.querySelector("td")!.textContent).toBe("borracha");
    expect(container.querySelector("pre code")!.textContent).toBe("npm test");
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("rel")])).toEqual([
      ["loja", "https://example.com/precos", "noopener noreferrer"],
      ["https://example.org", "https://example.org", "noopener noreferrer"],
    ]);
  });

  it("never turns a reply into HTML", () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)"> [x](javascript:alert(1))'} bots={[]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });
});

describe("a bot at work", () => {
  it("shows one bubble per bot with its queue, and Stop cancels the running and the queued run", async () => {
    const { post } = fakeApi();
    render(<Timeline items={[]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[run("run_1", "running"), run("run_2", "queued")]} />);
    const bubbles = screen.getAllByTestId("working");
    expect(bubbles).toHaveLength(1);
    expect(within(bubbles[0]!).getByText("+1 queued")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("stop-run")));
    expect(post.mock.calls.map((c) => c[0]).sort()).toEqual(["/api/v1/runs/run_1/cancel", "/api/v1/runs/run_2/cancel"]);
  });

  it("says the bot waits for the user instead of showing typing dots", () => {
    render(<Timeline items={[]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[run("run_1", "waiting")]} />);
    expect(screen.getByTestId("waiting").textContent).toBe("Ana is waiting for you (an approval or an answer above)");
  });

  it("offers Try again on a failed run, once", async () => {
    const { post } = fakeApi();
    const failed: TimelineItem = {
      ...base,
      id: "i1",
      kind: "event",
      author: { type: "system", id: null },
      text: "Ana: openai brain: no API key",
      runId: "run_failed",
      event: { type: "run.failed", data: { runId: "run_failed", botId: ana.id } },
    };
    const { rerender } = render(<Timeline items={[failed]} bots={{ [ana.id]: ana }} runs={useStore.getState().runs} activeRuns={[]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(post).toHaveBeenCalledWith("/api/v1/runs/run_failed/retry");
    rerender(<Timeline items={[failed]} bots={{ [ana.id]: ana }} runs={useStore.getState().runs} activeRuns={[]} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("loads earlier messages on request", async () => {
    const onLoadEarlier = vi.fn(async () => undefined);
    const item: TimelineItem = { ...base, id: "i9", kind: "message", author: { type: "user", id: null }, text: "oi", runId: null };
    render(<Timeline items={[item]} bots={{}} runs={{}} activeRuns={[]} hasEarlier onLoadEarlier={onLoadEarlier} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" })));
    expect(onLoadEarlier).toHaveBeenCalledOnce();
  });
});

describe("sending", () => {
  it("keeps the text and says why when a message could not be sent", async () => {
    const onSend = vi.fn(async () => {
      throw new Error("hub answered 503");
    });
    render(<Composer name="Ana" onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "preço do lápis?", selectionStart: 15 } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(screen.getByTestId("send-error").textContent).toBe("Could not send: hub answered 503");
    expect(box.value).toBe("preço do lápis?");
  });

  it("does not send on the Enter that confirms an accent or an IME candidate", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Ana" onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "olá", selectionStart: 3 } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter", isComposing: true }));
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(onSend).toHaveBeenCalledWith("olá", []);
  });
});
