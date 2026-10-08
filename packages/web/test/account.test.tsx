// specs/web-app — Orbis accounts (change 0064-account-sign-in): signing in with an email and a password,
// the reset link and the new password, the session renewed before it ends, and Settings → Account linking
// the hub to the account with its token.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountStatus, AuthConfig } from "@orbis/shared";
import { Api } from "../src/api.js";
import { AccountSession, captureAuthFromUrl, loadSession, signIn, signUp, type Session } from "../src/account.js";
import { TokenGate } from "../src/components/TokenGate.js";
import { AccountSettings } from "../src/components/AccountSettings.js";
import { useLang } from "../src/i18n.js";

const project = { url: "https://proj.supabase.co", key: "sb_publishable_x" };
const auth: AuthConfig = { supabase: project, linked: true };
const user = { id: "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60", email: "ana@example.com" };
const tokenAnswer = (access = "access-1", over: object = {}) => ({ access_token: access, refresh_token: `refresh-${access}`, expires_in: 3600, user, ...over });

/** The sign-in service: each call recorded, each answer given by the test. */
function fakeAuth(answer: (url: string, init: RequestInit) => { status?: number; body: object }) {
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const { status = 200, body } = answer(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sent = (init: RequestInit | undefined) => JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the account client", () => {
  it("signs in with the project's publishable key, and refuses a short password before asking", async () => {
    const fetchMock = fakeAuth(() => ({ body: tokenAnswer() }));
    const session = await signIn(project, " ana@example.com ", "a long password");
    expect(session).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-access-1", user });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/auth/v1/token?grant_type=password");
    expect((init!.headers as Record<string, string>).apikey).toBe("sb_publishable_x");
    expect(sent(init)).toEqual({ email: "ana@example.com", password: "a long password" });
    await expect(signUp(project, "ana@example.com", "short", "http://localhost/")).rejects.toThrow(/10 characters/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renews the session before it ends, once for many requests, and ends it when renewal is refused", async () => {
    let now = Date.now();
    let refused = false;
    const fetchMock = fakeAuth((url) =>
      refused ? { status: 400, body: { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" } } : url.includes("refresh_token") ? { body: tokenAnswer("access-2") } : { body: {} },
    );
    const ended = vi.fn();
    const first: Session = { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: now + 30 * 60_000, user };
    const account = new AccountSession(project, first, ended, () => now);
    expect(await account.token()).toBe("access-1");
    expect(fetchMock).not.toHaveBeenCalled();
    now += 29.5 * 60_000;
    const [a, b] = await Promise.all([account.token(), account.token()]);
    expect([a, b]).toEqual(["access-2", "access-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent(fetchMock.mock.calls[0]![1])).toEqual({ refresh_token: "refresh-1" });
    expect(loadSession()?.accessToken).toBe("access-2");

    now += 2 * 60 * 60_000;
    refused = true;
    await expect(account.token()).rejects.toThrow(/Invalid Refresh Token/);
    expect(ended).toHaveBeenCalledOnce();
    expect(loadSession()).toBeNull();
  });

  it("takes an email link's session from the address and removes it", () => {
    const claims = btoa(JSON.stringify({ sub: user.id, email: user.email })).replace(/=+$/, "");
    history.replaceState(null, "", `/#access_token=h.${claims}.s&refresh_token=r1&expires_in=3600&type=recovery`);
    const got = captureAuthFromUrl();
    expect(got).toMatchObject({ type: "recovery", error: null, session: { accessToken: `h.${claims}.s`, refreshToken: "r1", user } });
    expect(window.location.hash).toBe("");
    history.replaceState(null, "", "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(captureAuthFromUrl()).toMatchObject({ session: null, error: "Email link is invalid or has expired" });
    expect(captureAuthFromUrl()).toBeNull();
  });
});

describe("the sign-in screen", () => {
  it("signs in with the linked account, says a wrong password, and still offers the token", async () => {
    let wrong = true;
    fakeAuth(() => (wrong ? { status: 400, body: { error_code: "invalid_credentials", msg: "Invalid login credentials" } } : { body: tokenAnswer() }));
    const onSession = vi.fn();
    render(<TokenGate auth={auth} onToken={() => undefined} onSession={onSession} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not the password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong email or password.")).toBeTruthy();
    wrong = false;
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "access-1" })));

    fireEvent.click(screen.getByRole("button", { name: "Use a token or a code" }));
    expect(screen.getByPlaceholderText("API token")).toBeTruthy();
  });

  it("emails a reset link that comes back to this page, and saves the new password", async () => {
    const fetchMock = fakeAuth(() => ({ body: {} }));
    const { unmount } = render(<TokenGate auth={auth} onToken={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot the password" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://proj.supabase.co/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin + "/")}`);
    unmount();

    const session: Session = { accessToken: "access-r", refreshToken: "refresh-r", expiresAt: Date.now() + 3_600_000, user };
    const onSession = vi.fn();
    render(<TokenGate auth={{ ...auth, linked: false }} newPassword={session} onToken={() => undefined} onSession={onSession} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a brand new password" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "a brand new password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe("https://proj.supabase.co/auth/v1/user");
    expect(init!.method).toBe("PUT");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer access-r");
  });

  it("asks for the token when no account opens this hub", () => {
    render(<TokenGate auth={{ ...auth, linked: false }} onToken={() => undefined} />);
    expect(screen.getByPlaceholderText("API token")).toBeTruthy();
  });
});

describe("Settings → Account", () => {
  it("signs in to the account with the hub's token, links it, and unlinks it", async () => {
    fakeAuth(() => ({ body: tokenAnswer("access-link") }));
    let status: AccountStatus = { available: true, linked: null, via: "token" };
    const api = new Api("tok");
    vi.spyOn(api, "get").mockImplementation(async (path: string) => (path === "/api/v1/auth/config" ? { supabase: project, linked: false } : status) as never);
    const post = vi.spyOn(api, "post").mockImplementation(async () => {
      status = { ...status, linked: { userId: user.id, email: user.email, linkedAt: "2026-10-08T12:00:00.000Z" } };
      return status as never;
    });
    const del = vi.spyOn(api, "delete").mockImplementation(async () => (status = { ...status, linked: null }) as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AccountSettings api={api} account={null} onSignedOut={() => undefined} />);
    expect((await screen.findByTestId("account-status")).textContent).toContain("No account linked");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Signed in as ana@example.com.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Link this hub to my account" }));
    await waitFor(() => expect(screen.getByTestId("account-status").textContent).toContain("Linked to the account ana@example.com."));
    expect(post).toHaveBeenCalledWith("/api/v1/account/link", { accessToken: "access-link" });

    fireEvent.click(screen.getByRole("button", { name: "Unlink the account" }));
    expect(del).toHaveBeenCalledWith("/api/v1/account");
    await waitFor(() => expect(screen.getByTestId("account-status").textContent).toContain("No account linked"));
  });

  it("creates an account and says to confirm it from the email", async () => {
    const fetchMock = fakeAuth(() => ({ body: { id: user.id, email: user.email, confirmation_sent_at: "2026-10-08T12:00:00Z" } }));
    const api = new Api("tok");
    vi.spyOn(api, "get").mockImplementation(async (path: string) =>
      (path === "/api/v1/auth/config" ? { supabase: project, linked: false } : { available: true, linked: null, via: "token" }) as never,
    );
    render(<AccountSettings api={api} account={null} onSignedOut={() => undefined} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long password" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "a long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("status")).textContent).toBe("We sent a confirmation link to ana@example.com. Confirm it, then sign in here.");
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/proj\.supabase\.co\/auth\/v1\/signup\?redirect_to=/);
  });
});
