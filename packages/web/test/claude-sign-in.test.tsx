// specs/web-app — Claude Code's login from the settings screen (change
// 0033): the brain's card says whether it is signed in, offers signing in, and
// when its test fails because the login expired says so and brings the way
// out; the sign-in shows the page and takes the code it displays.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BrainTestResult, ClaudeAccount, CliJob, RuntimeHealth } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { SettingsScreen } from "../src/components/SettingsScreen.js";
import { useLang } from "../src/i18n.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

const job = (fields: Partial<CliJob>): CliJob => ({
  kind: "login",
  state: "running",
  startedAt: "",
  finishedAt: null,
  url: null,
  code: null,
  log: "",
  error: null,
  ...fields,
});
const EXPIRED = "Failed to authenticate: OAuth session expired and could not be refreshed";

describe("Claude Code's card in the settings screen", () => {
  it("shows the expired login after a test, signs in with the page and the code, then tests well", async () => {
    let account: ClaudeAccount = {
      installed: true,
      version: "2.1.283 (Claude Code)",
      path: "/bin/claude",
      loggedIn: true,
      method: "oauth_token",
      detail: null,
      job: null,
    };
    let signedInAgain = false;
    const health: RuntimeHealth[] = [{ kind: "claude-code", executable: "claude", found: true, path: "/bin/claude", version: "2.1.283 (Claude Code)" }];
    const post = vi.fn(async (path: string, body?: object) => {
      if (path === "/api/v1/runtimes/claude/login") {
        account = { ...account, job: job({ url: "https://sign-in.example.com/oauth/authorize?state=x" }) };
        return account.job;
      }
      if (path === "/api/v1/runtimes/claude/code") {
        expect(body).toEqual({ code: "good-code" });
        signedInAgain = true;
        account = {
          ...account,
          job: job({ state: "done", finishedAt: "2026-10-02T16:00:00.000Z", url: "https://sign-in.example.com/oauth/authorize?state=x" }),
        };
        return { sent: true };
      }
      if (path === "/api/v1/runtimes/test") {
        const result: BrainTestResult = signedInAgain
          ? { kind: "claude-code", ok: true, reply: "391", error: null, durationMs: 3000, answered: true }
          : { kind: "claude-code", ok: false, reply: "", error: EXPIRED, durationMs: 900, answered: false };
        return result;
      }
      throw new Error(`unexpected POST ${path}`);
    });
    const get = vi.fn(async (path: string) => {
      if (path === "/api/v1/runtimes/claude/account") return account;
      if (path === "/api/v1/runtimes/health") return health;
      if (path === "/api/v1/runtimes/local") return [];
      if (path === "/api/v1/runtimes/codex/account")
        return { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job: null };
      throw new Error(`unexpected GET ${path}`);
    });
    render(<SettingsScreen api={{ get, post } as unknown as Api} bots={[]} onConfigureBot={() => undefined} />);
    const card = await screen.findByTestId("brain-claude-code");
    const box = await within(card).findByTestId("claude-sign-in");
    expect(box.textContent).toContain("Account: ✓ Signed in (oauth_token)");
    expect(within(box).queryByRole("alert")).toBeNull();

    // The test fails: the login expired.
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Test" })));
    await waitFor(() => expect(card.textContent).toContain(EXPIRED));
    expect(within(box).getByRole("alert").textContent).toMatch(/login expired\. Sign in again/);
    expect(card.textContent).toContain("sign in again in the box above");

    // Sign in again: the page to open and the code it shows.
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Sign in again" })));
    const login = await within(card).findByTestId("claude-login");
    const page = within(login).getByRole("link", { name: "Open the sign-in page" });
    expect(page.getAttribute("href")).toBe("https://sign-in.example.com/oauth/authorize?state=x");
    expect(page.getAttribute("target")).toBe("_blank");
    const send = within(login).getByRole("button", { name: "Send code" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(login).getByLabelText("Code from the page (if it shows one)"), { target: { value: "  good-code " } });
    await act(async () => fireEvent.click(send));
    await waitFor(() => expect(within(card).queryByTestId("claude-login")).toBeNull(), { timeout: 4_000 });
    expect(card.textContent).toContain("Signed in. Press Test to check.");
    // The old failure is gone with the sign-in; the next test passes.
    expect(card.textContent).not.toContain(EXPIRED);
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Test" })));
    await waitFor(() => expect(card.textContent).toMatch(/391/));
  });

  it("offers the plain sign-in when the CLI is not signed in, and shows why a sign-in failed", async () => {
    let account: ClaudeAccount = { installed: true, version: "2.1.283", path: "/bin/claude", loggedIn: false, method: "none", detail: null, job: null };
    const post = vi.fn(async () => {
      account = { ...account, job: job({ state: "failed", error: "Invalid code." }) };
      return account.job;
    });
    const get = vi.fn(async (path: string) => {
      if (path === "/api/v1/runtimes/claude/account") return account;
      if (path === "/api/v1/runtimes/health") return [{ kind: "claude-code", executable: "claude", found: true, path: "/bin/claude", version: "2.1.283" }];
      if (path === "/api/v1/runtimes/local") return [];
      if (path === "/api/v1/runtimes/codex/account")
        return { installed: false, version: null, path: null, loggedIn: false, method: null, detail: null, job: null };
      throw new Error(`unexpected GET ${path}`);
    });
    render(<SettingsScreen api={{ get, post } as unknown as Api} bots={[]} onConfigureBot={() => undefined} />);
    const box = await screen.findByTestId("claude-sign-in");
    expect(box.textContent).toContain("Account: Not signed in");
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Sign in with your Claude account" })));
    await waitFor(() => expect(box.textContent).toContain("Invalid code."));
  });
});
