// specs/web-app — Claude Code's login from the settings screen (change
// 0033): the brain's card says whether it is signed in, offers signing in, and
// when its test fails because the login expired says so and brings the way
// out; the sign-in shows the page and takes the code it displays. The
// subscription token from `claude setup-token` is saved, replaced and removed
// from the same card (change 0051).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BrainTestResult, ClaudeAccount, ClaudeTokenStatus, CliJob, RuntimeHealth } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { ClaudeSignIn } from "../src/components/ClaudeSignIn.js";
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
const NO_TOKEN = { saved: false, source: null, savedAt: null, expiresAround: null } as const;

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
      token: NO_TOKEN,
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
    let account: ClaudeAccount = {
      installed: true,
      version: "2.1.283",
      path: "/bin/claude",
      loggedIn: false,
      method: "none",
      detail: null,
      job: null,
      token: NO_TOKEN,
    };
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
  it("saves the subscription token from claude setup-token, says until about when it lasts, replaces and removes it", async () => {
    const saved: ClaudeTokenStatus = {
      saved: true,
      source: "saved",
      savedAt: "2026-10-03T12:00:00.000Z",
      expiresAround: "2027-10-03T12:00:00.000Z",
    };
    let account: ClaudeAccount = {
      installed: true,
      version: "2.1.288",
      path: "/bin/claude",
      loggedIn: false,
      method: "none",
      detail: null,
      job: null,
      token: NO_TOKEN,
    };
    const put = vi.fn(async (_path: string, body: { token: string }) => {
      if (body.token.startsWith("sk-ant-api")) throw new Error("this is an API key, which bills the Claude API");
      account = { ...account, loggedIn: true, method: "oauth_token", token: saved };
      return saved;
    });
    const del = vi.fn(async () => {
      account = { ...account, loggedIn: false, method: "none", token: NO_TOKEN };
      return NO_TOKEN;
    });
    const api = { get: vi.fn(async () => account), post: vi.fn(), put, delete: del } as unknown as Api;
    render(<ClaudeSignIn api={api} expired={false} />);
    const box = await screen.findByTestId("claude-token");
    expect(box.textContent).toContain("No token: Claude Code uses this computer's sign-in.");
    expect(box.textContent).toContain("claude setup-token");
    const field = within(box).getByLabelText("Token from claude setup-token") as HTMLInputElement;
    expect(field.type).toBe("password");
    expect((within(box).getByRole("button", { name: "Save token" }) as HTMLButtonElement).disabled).toBe(true);

    // An API key is refused with the hub's words.
    fireEvent.change(field, { target: { value: "sk-ant-api03-not-this" } });
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Save token" })));
    expect(within(box).getByRole("alert").textContent).toContain("API key");

    fireEvent.change(field, { target: { value: "  sk-ant-oat01-made-up  " } });
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Save token" })));
    expect(put).toHaveBeenLastCalledWith("/api/v1/runtimes/claude/token", { token: "sk-ant-oat01-made-up" });
    await waitFor(() => expect(box.textContent).toMatch(/Token saved on Oct 3, 2026 · lasts until about Oct 3, 2027/));
    expect(field.value).toBe("");
    expect(box.textContent).toContain("Claude Code uses it instead of the sign-in");
    expect(screen.getByTestId("claude-sign-in").textContent).toContain("Signed in (oauth_token)");
    expect(within(box).getByRole("button", { name: "Replace token" })).toBeTruthy();

    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Remove token" })));
    expect(del).toHaveBeenCalledWith("/api/v1/runtimes/claude/token");
    await waitFor(() => expect(box.textContent).toContain("No token"));
  });

  it("says a refused token needs a new one from claude setup-token, and a token set on the server", async () => {
    const account: ClaudeAccount = {
      installed: true,
      version: "2.1.288",
      path: "/bin/claude",
      loggedIn: true,
      method: "oauth_token",
      detail: null,
      job: null,
      token: { saved: true, source: "server", savedAt: null, expiresAround: null },
    };
    render(<ClaudeSignIn api={{ get: vi.fn(async () => account) } as unknown as Api} expired />);
    const box = await screen.findByTestId("claude-sign-in");
    expect(within(box).getByRole("alert").textContent).toContain("Run claude setup-token again");
    expect(within(screen.getByTestId("claude-token")).getByText("✓ Token set on the server (CLAUDE_CODE_OAUTH_TOKEN)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove token" })).toBeNull();
  });
});
