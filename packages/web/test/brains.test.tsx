// specs/web-app — the settings screen (brains on this machine, the brain test,
// which bot uses which brain) and the local model suggestions on the new-bot screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BrainTestResult, LocalModelServer, RuntimeHealth } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { NewBotScreen } from "../src/components/NewBotScreen.js";
import { SettingsScreen } from "../src/components/SettingsScreen.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA", brain: { kind: "claude-code" } });
const echo = bot({ name: "Echo", brain: { kind: "mock" } });

const health: RuntimeHealth[] = [
  { kind: "claude-code", executable: "claude", found: true, path: "/usr/bin/claude", version: "2.1.0 (Claude Code)" },
  { kind: "codex", executable: "codex", found: false, path: null, version: null },
  { kind: "gemini-cli", executable: "gemini", found: false, path: null, version: null },
  { kind: "cursor", executable: "agent", found: true, path: "/home/u/.local/bin/agent", version: "2026.09.20" },
];
const local: LocalModelServer[] = [
  { kind: "ollama", baseUrl: "http://127.0.0.1:11434/v1", reachable: true, models: ["llama3.2:latest", "qwen3:4b"], error: null },
  { kind: "lmstudio", baseUrl: "http://127.0.0.1:1234/v1", reachable: false, models: [], error: "not reachable at http://127.0.0.1:1234/v1" },
];

function fakeApi(answer: (body: any) => BrainTestResult) {
  const get = vi.fn(async (path: string) => (path === "/api/v1/runtimes/health" ? health : local));
  const post = vi.fn(async (_path: string, body: any) => answer(body));
  return { api: { get, post } as unknown as Api, get, post };
}

const result = (fields: Partial<BrainTestResult>): BrainTestResult => ({ kind: "claude-code", ok: true, reply: "391", error: null, durationMs: 3200, answered: true, ...fields });

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("settings screen", () => {
  it("shows which brains this machine has and tests one, proving a model answered", async () => {
    const { api, post } = fakeApi(() => result({}));
    render(<SettingsScreen api={api} bots={[ana, echo]} onConfigureBot={() => undefined} />);

    const claude = await screen.findByTestId("brain-claude-code");
    expect(claude.textContent).toContain("✓ Installed");
    expect(claude.textContent).toContain("2.1.0 (Claude Code)");
    const codex = screen.getByTestId("brain-codex");
    expect(codex.textContent).toContain("✗ Not found");
    expect(codex.textContent).toContain("npm i -g @openai/codex");
    expect(within(codex).getByRole("button", { name: "Test" })).toHaveProperty("disabled", true);
    expect(screen.getByTestId("brain-cursor").textContent).toContain("Cursor CLI");

    await act(async () => fireEvent.click(within(claude).getByRole("button", { name: "Test" })));
    expect(post).toHaveBeenCalledWith("/api/v1/runtimes/test", { brain: { kind: "claude-code" } });
    expect(within(claude).getByRole("status").textContent).toBe("✓ Answered in 3.2 s: 391");
  });

  it("lists the local servers with their models, tests the chosen model, and says when one is off", async () => {
    const { api, post } = fakeApi((body) => result({ kind: "ollama", reply: "391" , durationMs: 800, ...(body.brain.model ? {} : {}) }));
    render(<SettingsScreen api={api} bots={[]} onConfigureBot={() => undefined} />);
    const ollama = await screen.findByTestId("brain-ollama");
    expect(ollama.textContent).toContain("✓ Running, 2 models");
    fireEvent.change(within(ollama).getByLabelText("Model"), { target: { value: "qwen3:4b" } });
    await act(async () => fireEvent.click(within(ollama).getByRole("button", { name: "Test" })));
    expect(post).toHaveBeenCalledWith("/api/v1/runtimes/test", { brain: { kind: "ollama", model: "qwen3:4b" } });

    const studio = screen.getByTestId("brain-lmstudio");
    expect(studio.textContent).toContain("✗ Off");
    expect(studio.textContent).toContain("Nothing answers at http://127.0.0.1:1234/v1.");
    expect(studio.textContent).toContain("Start server");
    expect(within(studio).getByRole("button", { name: "Test" })).toHaveProperty("disabled", true);
    expect(screen.getByText("No bots yet.")).toBeTruthy();
  });

  it("shows each bot's brain, tests the bot's own brain, warns on an echo and opens its settings", async () => {
    const { api, post } = fakeApi((body) =>
      body.botId === echo.id ? result({ kind: "mock", reply: "[Echo] What is 17 × 23? Answer with the number only.", answered: false, durationMs: 10 }) : result({}),
    );
    const configure = vi.fn();
    render(<SettingsScreen api={api} bots={[ana, echo]} onConfigureBot={configure} />);
    const anaRow = await screen.findByTestId(`brain-bot-${ana.handle}`);
    expect(anaRow.textContent).toContain("Claude Code");
    const echoRow = screen.getByTestId(`brain-bot-${echo.handle}`);
    expect(echoRow.textContent).toContain("Mock (no AI)");

    await act(async () => fireEvent.click(within(echoRow).getByRole("button", { name: "Test" })));
    expect(post).toHaveBeenCalledWith("/api/v1/runtimes/test", { botId: echo.id });
    const status = within(echoRow).getByRole("status").textContent ?? "";
    expect(status).toContain("⚠ Answered in 0.0 s: [Echo] What is 17 × 23?");
    expect(status).toContain("no model answered (Mock only repeats the message)");

    fireEvent.click(within(anaRow).getByRole("button", { name: /Configure/ }));
    expect(configure).toHaveBeenCalledWith(ana.id);
  });

  it("shows a failed test with the brain's error", async () => {
    const { api } = fakeApi(() => result({ ok: false, answered: false, reply: "", error: "claude-code brain: executable \"claude\" not found on PATH" }));
    render(<SettingsScreen api={api} bots={[ana]} onConfigureBot={() => undefined} />);
    const row = await screen.findByTestId(`brain-bot-${ana.handle}`);
    await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Test" })));
    expect(within(row).getByRole("status").textContent).toBe('✗ Failed: claude-code brain: executable "claude" not found on PATH');
  });
});

describe("new-bot screen brains", () => {
  it("offers Cursor, Ollama and LM Studio, and suggests the models Ollama has", async () => {
    const { api } = fakeApi(() => result({}));
    const onCreate = vi.fn(async () => undefined);
    render(<NewBotScreen api={api} bots={[]} onCreate={onCreate} />);
    const brain = screen.getByLabelText("Brain") as HTMLSelectElement;
    const options = [...brain.options].map((o) => o.textContent);
    expect(options).toContain("Cursor CLI (subscription, no API)");
    expect(options).toContain("Ollama (local model, no API)");
    expect(options).toContain("LM Studio (local model, no API)");

    fireEvent.change(brain, { target: { value: "ollama" } });
    const model = screen.getByLabelText("Model") as HTMLInputElement;
    await waitFor(() => expect(document.querySelectorAll("#model-models option")).toHaveLength(2));
    expect(model.required).toBe(true);
    expect((screen.getByLabelText(/Base URL/) as HTMLInputElement).placeholder).toBe("http://127.0.0.1:11434/v1");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Olla" } });
    fireEvent.change(model, { target: { value: "qwen3:4b" } });
    await act(async () => fireEvent.submit(brain.form!));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Olla", brain: { kind: "ollama", model: "qwen3:4b" } }));
  });
});
