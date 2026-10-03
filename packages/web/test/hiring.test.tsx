// specs/hiring — the hiring screen: a new opening for a project or a team (how many, who writes, what it
// costs), rounds of short résumés with their tools, dismissing and bringing back, and the hire sheet with
// the brain, the manager and the group.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Candidate, Conversation, HiringRound, HiringTool } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { defaultRecruiter, HiringScreen } from "../src/components/HiringScreen.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const ana = bot({ name: "Ana", role: "Research" });
const rita = bot({ name: "Rita", role: "RH" });
const bob = bot({ name: "Bob", role: "Lead" });
const group: Conversation = {
  id: "cnv_launch",
  kind: "group",
  title: "Launch",
  members: [ana.id, bob.id],
  leadBotId: bob.id,
  description: "",
  photo: null,
  muted: false,
  createdAt: "2026-10-03T10:00:00.000Z",
  lastItemAt: null,
};
const tools: HiringTool[] = [
  { id: "web", name: "Web", description: "fetches pages", logo: null },
  { id: "mcp.github", name: "GitHub", description: "repositories", logo: "/logos/mcp/github.svg" },
];
const candidate = (c: Partial<Candidate> & { id: string; name: string }): Candidate => ({
  roundId: "hir_1",
  role: "Data analyst",
  headline: "Turns questions into numbers",
  strengths: ["SQL", "clear charts"],
  tools: ["web", "mcp.github"],
  status: "open",
  error: null,
  botId: null,
  createdAt: "2026-10-03T10:00:00.000Z",
  ...c,
});
const round = (r: Partial<HiringRound> = {}): HiringRound => ({
  id: "hir_1",
  basis: "team",
  brief: "",
  groupId: group.id,
  recruiterId: rita.id,
  requested: 3,
  status: "ready",
  error: null,
  usage: { inputTokens: 1200, outputTokens: 300, costUsd: 0.01 },
  candidates: [candidate({ id: "cand_lia", name: "Lia" }), candidate({ id: "cand_rui", name: "Rui", role: "Developer", status: "hired", botId: "bot_rui" })],
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z",
  ...r,
});

function fakeApi() {
  const post = vi.fn(async () => ({}));
  const request = vi.fn(async () => ({}));
  const api = { get: vi.fn(async () => tools), post, request, delete: vi.fn(async () => null) } as unknown as Api;
  return { api, post, request };
}

describe("a new opening", () => {
  it("asks for N résumés of a project, written by the recruiter, and says what it costs", async () => {
    const { api, post } = fakeApi();
    render(<HiringScreen api={api} bots={[ana, rita]} conversations={[]} rounds={{}} onLoad={async () => undefined} onOpenBot={() => undefined} />);
    const form = screen.getByTestId("hiring-new");
    // The recruiter is the bot whose role says so.
    expect((within(form).getByLabelText(/Who writes the résumés/) as HTMLSelectElement).value).toBe(rita.id);
    expect(within(form).getByRole("button", { name: "Generate 10 candidates" })).toHaveProperty("disabled", true);
    fireEvent.change(within(form).getByLabelText("The project"), { target: { value: "A dashboard of stocks" } });
    fireEvent.click(within(form).getByRole("button", { name: "20" }));
    expect(within(form).getByText(/≈ 1400 response tokens for 20 résumés/)).toBeTruthy();
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Generate 20 candidates" })));
    expect(post).toHaveBeenCalledWith("/api/v1/hiring/rounds", {
      basis: "project",
      brief: "A dashboard of stocks",
      recruiterId: rita.id,
      count: 20,
      lang: "en",
    });
    expect(screen.getByText(/No opening yet/)).toBeTruthy();
  });

  it("asks for a team's résumés with its group and a focus, and needs a bot first", async () => {
    const { api, post } = fakeApi();
    const { unmount } = render(
      <HiringScreen api={api} bots={[ana, rita, bob]} conversations={[group]} rounds={{}} onLoad={async () => undefined} onOpenBot={() => undefined} />,
    );
    const form = screen.getByTestId("hiring-new");
    fireEvent.click(within(form).getByRole("radio", { name: "My team" }));
    expect((within(form).getByLabelText(/^Team \(group\)/) as HTMLSelectElement).value).toBe(group.id);
    fireEvent.change(within(form).getByLabelText("Focus (optional)"), { target: { value: "someone for data" } });
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Generate 10 candidates" })));
    expect(post).toHaveBeenCalledWith("/api/v1/hiring/rounds", {
      basis: "team",
      groupId: group.id,
      brief: "someone for data",
      recruiterId: rita.id,
      count: 10,
      lang: "en",
    });
    unmount();

    render(<HiringScreen api={api} bots={[]} conversations={[]} rounds={{}} onLoad={async () => undefined} onOpenBot={() => undefined} />);
    expect(screen.getByText("Create a bot first: its brain writes the résumés.")).toBeTruthy();
    expect(defaultRecruiter([ana, bob], "")).toBe(ana.id);
    expect(defaultRecruiter([ana, bob], bob.id)).toBe(bob.id);
  });
});

describe("a round of résumés", () => {
  it("shows each candidate with its tools, dismisses and brings back, opens a hire's chat, and asks for more", async () => {
    const { api, post, request } = fakeApi();
    const onOpenBot = vi.fn();
    const { rerender } = render(
      <HiringScreen
        api={api}
        bots={[ana, rita, bob]}
        conversations={[group]}
        rounds={{ hir_1: round() }}
        onLoad={async () => undefined}
        onOpenBot={onOpenBot}
      />,
    );
    const r = screen.getByTestId("round-hir_1");
    expect(within(r).getByRole("heading", { name: "Team: Launch" })).toBeTruthy();
    expect(within(r).getByText(/by Rita · candidates: 2 · hired: 1 · 1,500 tokens/)).toBeTruthy();
    const lia = screen.getByTestId("candidate-cand_lia");
    expect(within(lia).getByText("Turns questions into numbers")).toBeTruthy();
    await waitFor(() => expect(within(lia).getByText("GitHub").querySelector("img")?.getAttribute("src")).toBe("/logos/mcp/github.svg"));
    expect(within(lia).getByText("Web")).toBeTruthy();

    fireEvent.click(within(lia).getByRole("button", { name: "Dismiss Lia" }));
    expect(request).toHaveBeenCalledWith("PATCH", "/api/v1/hiring/candidates/cand_lia", { status: "dismissed" });
    fireEvent.click(within(screen.getByTestId("candidate-cand_rui")).getByRole("button", { name: "Open the chat" }));
    expect(onOpenBot).toHaveBeenCalledWith("bot_rui");
    await act(async () => fireEvent.click(within(r).getByRole("button", { name: "3 more" })));
    expect(post).toHaveBeenCalledWith("/api/v1/hiring/rounds/hir_1/more", { count: 3, lang: "en" });

    // Dismissed ones hide behind a link; a round at work and a failed one say so.
    const later = round({ candidates: [candidate({ id: "cand_lia", name: "Lia", status: "dismissed" })], status: "generating", requested: 5 });
    rerender(
      <HiringScreen api={api} bots={[ana, rita, bob]} conversations={[group]} rounds={{ hir_1: later }} onLoad={async () => undefined} onOpenBot={onOpenBot} />,
    );
    expect(screen.queryByTestId("candidate-cand_lia")).toBeNull();
    expect(screen.getByText("Rita is writing 5 résumés…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See dismissed (1)" }));
    fireEvent.click(within(screen.getByTestId("candidate-cand_lia")).getByRole("button", { name: "Bring back" }));
    expect(request).toHaveBeenCalledWith("PATCH", "/api/v1/hiring/candidates/cand_lia", { status: "open" });
    rerender(
      <HiringScreen
        api={api}
        bots={[ana, rita, bob]}
        conversations={[group]}
        rounds={{ hir_1: round({ status: "failed", error: "Rita's brain failed: quota exceeded", candidates: [] }) }}
        onLoad={async () => undefined}
        onOpenBot={onOpenBot}
      />,
    );
    expect(screen.getByText("Rita's brain failed: quota exceeded")).toBeTruthy();
  });

  it("hires with the recruiter's brain, under the group's lead, into the group — or as the user chooses", async () => {
    const { api, post } = fakeApi();
    render(
      <HiringScreen
        api={api}
        bots={[ana, rita, bob]}
        conversations={[group]}
        rounds={{ hir_1: round() }}
        onLoad={async () => undefined}
        onOpenBot={() => undefined}
      />,
    );
    fireEvent.click(within(screen.getByTestId("candidate-cand_lia")).getByRole("button", { name: "Hire" }));
    const sheet = screen.getByRole("dialog", { name: "Hire Lia" });
    expect((within(sheet).getByLabelText(/^Brain: the same as/) as HTMLSelectElement).value).toBe(rita.id);
    expect((within(sheet).getByLabelText(/^Reports to/) as HTMLSelectElement).value).toBe(bob.id);
    expect((within(sheet).getByLabelText("Joins the group Launch") as HTMLInputElement).checked).toBe(true);
    expect(within(sheet).getByText(/Rita now writes Lia's full profile/)).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText(/^Brain: the same as/), { target: { value: ana.id } });
    fireEvent.change(within(sheet).getByLabelText(/^Reports to/), { target: { value: "" } });
    fireEvent.click(within(sheet).getByLabelText("Joins the group Launch"));
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Hire Lia" })));
    expect(post).toHaveBeenCalledWith("/api/v1/hiring/candidates/cand_lia/hire", { brainFrom: ana.id, reportsTo: null, joinGroup: false, lang: "en" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
