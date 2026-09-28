// specs/web-app — ChatGPT through the Codex CLI (change 0019-chatgpt-codex):
// the card installs Codex, starts the sign-in with a code, shows the code and
// the page to open, then says the account is connected and tests it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CliJob, CodexAccount } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { ChatGptCard } from "../src/components/ChatGptCard.js";
import { useLang } from "../src/i18n.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const job = (fields: Partial<CliJob>): CliJob => ({ kind: "login", state: "running", startedAt: "", finishedAt: null, url: null, code: null, log: "", error: null, ...fields });

describe("the ChatGPT card", () => {
  it("installs Codex, signs in with a code on another device, and tests the ChatGPT brain", async () => {
    let account: CodexAccount = { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job: null };
    const post = vi.fn(async (path: string, body?: object) => {
      if (path.endsWith("/install")) {
        account = { ...account, installed: true, version: "codex-cli 0.158.0", path: "/usr/local/bin/codex", detail: "Not logged in", job: job({ kind: "install", state: "done" }) };
        return account.job;
      }
      if (path.endsWith("/login")) {
        expect(body).toEqual({ device: true });
        account = { ...account, job: job({ url: "https://auth.openai.com/codex/device", code: "30UB-A2XD1" }) };
        return account.job;
      }
      if (path === "/api/v1/runtimes/test") return { kind: "codex", ok: true, reply: "391", error: null, durationMs: 2100, answered: true };
      return account;
    });
    const api = { get: vi.fn(async () => account), post } as unknown as Api;
    render(<ChatGptCard api={api} />);
    const card = screen.getByTestId("chatgpt-card");
    await waitFor(() => expect(card.textContent).toContain("Codex not installed"));
    expect(card.textContent).toContain("no API key");

    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Install Codex" })));
    await waitFor(() => expect(card.textContent).toContain("✓ codex-cli 0.158.0"));
    expect(card.textContent).toContain("Not signed in");

    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Sign in with a code (another device)" })));
    const login = await within(card).findByTestId("chatgpt-login");
    expect(within(login).getByLabelText("One-time code").textContent).toBe("30UB-A2XD1");
    const page = within(login).getByRole("link", { name: "Open the OpenAI page" });
    expect(page.getAttribute("href")).toBe("https://auth.openai.com/codex/device");
    expect(page.getAttribute("target")).toBe("_blank");

    // Codex finishes the sign-in; the card polls and shows the account.
    account = { ...account, loggedIn: true, method: "chatgpt", detail: "Logged in using ChatGPT", job: job({ state: "done", url: "https://auth.openai.com/codex/device", code: "30UB-A2XD1" }) };
    await waitFor(() => expect(card.textContent).toContain("Connected to ChatGPT"), { timeout: 4_000 });
    expect(card.textContent).toContain("Logged in using ChatGPT");
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Test" })));
    expect(post).toHaveBeenCalledWith("/api/v1/runtimes/test", { brain: { kind: "codex" } });
    await waitFor(() => expect(card.textContent).toMatch(/391/));
  });
});
