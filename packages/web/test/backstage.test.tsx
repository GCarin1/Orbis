// specs/web-app — the team's work backstage (change 0082-backstage): the chat shows the user's message and the
// final answer, a line while the team works, and "See backstage" opens what they said to each other.
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TimelineItem } from "@orbis/shared";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import type { RunView } from "../src/store.js";
import { phoneNote } from "../src/phone.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Beatriz", role: "Lead" });
const bia = bot({ name: "Marina", role: "Research" });
const cris = bot({ name: "Helena", role: "Examples" });
const bots = { [ana.id]: ana, [bia.id]: bia, [cris.id]: cris };

const at = (n: number) => `2026-10-17T10:00:0${n}.000Z`;
const item = (over: Partial<TimelineItem> & { id: string }): TimelineItem => ({
  conversationId: "cnv_g",
  kind: "message",
  author: { type: "bot", id: ana.id },
  text: "",
  parentId: null,
  mentions: [],
  attachments: [],
  reactions: {},
  runId: null,
  createdAt: at(1),
  updatedAt: at(1),
  ...over,
});
const run = (id: string, botId: string, type: string, ref: string | null = null, status = "done"): RunView =>
  ({ id, botId, conversationId: "cnv_g", chainId: "chain_1", trigger: { type, ref }, status, steps: [], depth: 0 }) as unknown as RunView;

const handoff = (id: string, to: string, task: string) =>
  item({
    id,
    kind: "card",
    runId: "run_lead",
    backstage: true,
    text: task,
    card: { type: "handoff", state: "done", data: { from: ana.id, to, task, context: null, returnResult: true, receiverRunId: null } },
  });

beforeEach(() => act(() => useLang.getState().setLang("pt-BR")));

describe("the team's work backstage", () => {
  it("shows only the question and the answer, with the backstage a tap away", () => {
    const items = [
      item({ id: "u1", author: { type: "user", id: null }, text: "O Navio de Teseu é o mesmo barco?", createdAt: at(0) }),
      item({ id: "i1", runId: "run_lead", backstage: true, text: "Pedi ajuda à squad" }),
      handoff("c1", bia.id, "Resuma as posições"),
      handoff("c2", cris.id, "Dê exemplos"),
      item({ id: "i2", author: { type: "bot", id: bia.id }, runId: "run_bia", backstage: true, text: "Resumo longo da Marina" }),
      item({ id: "i3", author: { type: "bot", id: cris.id }, runId: "run_cris", backstage: true, text: "Exemplos da Helena" }),
      item({ id: "i4", runId: "run_report", text: "Depende do que você chama de mesmo." }),
    ];
    const runs = {
      run_lead: run("run_lead", ana.id, "message"),
      run_bia: run("run_bia", bia.id, "handoff", "c1"),
      run_cris: run("run_cris", cris.id, "handoff", "c2"),
      run_report: run("run_report", ana.id, "report"),
    };
    render(<Timeline items={items} bots={bots} runs={runs} activeRuns={[]} />);
    expect(screen.getAllByTestId("message").map((m) => m.textContent)).toEqual([
      expect.stringContaining("O Navio de Teseu"),
      expect.stringContaining("Depende do que você chama de mesmo."),
    ]);
    expect(screen.queryByText("Resumo longo da Marina")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver bastidores · 3 bots/ }));
    const dialog = screen.getByTestId("backstage");
    expect(within(dialog).getByText("Resumo longo da Marina")).toBeTruthy();
    expect(within(dialog).getByText("Exemplos da Helena")).toBeTruthy();
    expect(within(dialog).getByText("Pedi ajuda à squad")).toBeTruthy();
  });

  it("while the team works, says who the lead is talking with in one line", () => {
    const items = [
      item({ id: "u1", author: { type: "user", id: null }, text: "Pergunta", createdAt: at(0) }),
      handoff("c1", bia.id, "Resuma"),
      handoff("c2", cris.id, "Exemplos"),
    ];
    const active = [run("run_bia", bia.id, "handoff", "c1", "running"), run("run_cris", cris.id, "handoff", "c2", "running")];
    render(<Timeline items={items} bots={bots} runs={{}} activeRuns={active} />);
    expect(screen.getByTestId("team-working").textContent).toMatch(/Beatriz está conversando com Marina e Helena…/);
    expect(screen.queryAllByTestId("working")).toHaveLength(0);
  });

  it("never notifies the phone of backstage work", () => {
    const note = (backstage: boolean) =>
      phoneNote(
        { type: "timeline.item", ts: at(1), data: { conversationId: "cnv_g", item: item({ id: "x", text: "oi", backstage }) } },
        { bots, conversations: {} },
        (k) => k,
      );
    expect(note(true)).toBeNull();
    expect(note(false)).not.toBeNull();
  });
});

describe("switching how a conversation talks (change 0085)", () => {
  beforeEach(() => {
    act(() => useLang.getState().setLang("pt-BR"));
  });

  it("shows the switch in the chat, so the user sees it took", () => {
    const events = [
      item({ id: "e1", kind: "event", author: { type: "system", id: null }, text: "switched", event: { type: "conversation.style", data: { replyStyle: "chat" } } }),
      item({ id: "e2", kind: "event", author: { type: "system", id: null }, text: "switched", event: { type: "conversation.backstage", data: { backstage: false } } }),
    ];
    render(<Timeline items={events} bots={bots} runs={{}} activeRuns={[]} />);
    expect(screen.getAllByTestId("event").map((e) => e.textContent)).toEqual([
      "Você ativou as respostas curtas: os bots respondem em poucas frases",
      "O trabalho da equipe agora aparece no chat",
    ]);
  });
});
