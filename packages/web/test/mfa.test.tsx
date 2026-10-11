// specs/web-app — two-step verification (change 0070-oracle-only): signing in with an authenticator set up asks
// its 6-digit code after the password; Settings → Account sets one up from a QR code and has the hub require
// it, and turns it off.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AccountStatus, AuthConfig } from "@orbis/shared";
import { Api } from "../src/api.js";
import { AccountSession, aalOf, type Session } from "../src/account.js";
import { TokenGate } from "../src/components/TokenGate.js";
import { AccountSettings } from "../src/components/AccountSettings.js";
import { useLang } from "../src/i18n.js";

const project = { url: "https://proj.supabase.co", key: "sb_publishable_x" };
const user = { id: "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60", email: "ana@example.com" };
/** A session token with the given level (only its payload matters to the app). */
const jwt = (aal: string) => `h.${btoa(JSON.stringify({ sub: user.id, aal })).replace(/=+$/, "")}.s`;
const answer = (aal: string) => ({ access_token: jwt(aal), refresh_token: `r-${aal}`, expires_in: 3600, user });

function fakeAuth(factors: Array<{ id: string; status: string; factor_type: string }>) {
  const calls: Array<{ method: string; url: string; body: Record<string, string> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
      calls.push({ method, url, body });
      const path = url.replace(`${project.url}/auth/v1`, "");
      const json = (b: object, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (path.startsWith("/token")) return json(answer("aal1"));
      if (path === "/user") return json({ ...user, factors });
      if (path === "/factors" && method === "POST") return json({ id: "f-new", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP" } });
      if (/\/factors\/[^/]+\/challenge$/.test(path)) return json({ id: "ch-1" });
      if (/\/factors\/[^/]+\/verify$/.test(path)) return body.code === "123456" ? json(answer("aal2")) : json({ error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }, 422);
      if (/\/factors\/[^/]+$/.test(path) && method === "DELETE") return json({});
      return json({});
    }),
  );
  return calls;
}

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("two-step verification", () => {
  it("asks the authenticator's code after the password, and signs in with the session it proves", async () => {
    const calls = fakeAuth([{ id: "f-1", status: "verified", factor_type: "totp" }]);
    const onSession = vi.fn();
    const auth: AuthConfig = { supabase: project, linked: true };
    render(<TokenGate auth={auth} onToken={() => undefined} onSession={onSession} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const code = await screen.findByLabelText("6-digit code");
    expect(onSession).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/Wrong or expired code/)).toBeTruthy();
    fireEvent.change(code, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onSession).toHaveBeenCalled());
    expect(aalOf(onSession.mock.calls[0]![0] as Session)).toBe("aal2");
    expect(calls.filter((c) => c.url.endsWith("/factors/f-1/verify")).at(-1)!.body).toEqual({ challenge_id: "ch-1", code: "123456" });
  });

  it("signs in with the password alone when no authenticator is set up", async () => {
    fakeAuth([{ id: "f-x", status: "unverified", factor_type: "totp" }]);
    const onSession = vi.fn();
    render(<TokenGate auth={{ supabase: project, linked: true }} onToken={() => undefined} onSession={onSession} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSession).toHaveBeenCalled());
  });

  it("is set up in Settings → Account from a QR code, then required by the hub, and turned off", async () => {
    const calls = fakeAuth([]);
    const session: Session = { accessToken: jwt("aal1"), refreshToken: "r", expiresAt: Date.now() + 3_600_000, user };
    const account = new AccountSession(project, session);
    const api = new Api(account.token);
    let status: AccountStatus = { available: true, linked: { userId: user.id, email: user.email, linkedAt: "2026-10-11T12:00:00.000Z", mfa: false }, via: "account" };
    vi.spyOn(api, "get").mockImplementation(async (path: string) => (path === "/api/v1/auth/config" ? { supabase: project, linked: true } : status) as never);
    const put = vi.spyOn(api, "put").mockImplementation(async (_path: string, body: unknown) => {
      status = { ...status, linked: { ...status.linked!, mfa: (body as { required: boolean }).required } };
      return status as never;
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AccountSettings api={api} account={account} onSignedOut={() => undefined} />);
    const box = await screen.findByTestId("account-mfa");
    fireEvent.click(within(box).getByRole("button", { name: "Turn on" }));
    expect(await within(box).findByTestId("mfa-secret")).toHaveProperty("textContent", "JBSWY3DPEHPK3PXP");
    expect(within(box).getByAltText("QR code for the authenticator app").getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    fireEvent.change(within(box).getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(within(box).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Done: two-step verification is on.")).toBeTruthy();
    // The session on this device now carries the second step, and the hub requires it.
    expect(aalOf(account.current())).toBe("aal2");
    expect(put).toHaveBeenCalledWith("/api/v1/account/mfa", { required: true });
    expect(within(screen.getByTestId("account-mfa")).getByText("On: every sign-in asks the authenticator's code.")).toBeTruthy();

    calls.length = 0;
    vi.unstubAllGlobals();
    fakeAuth([{ id: "f-new", status: "verified", factor_type: "totp" }]);
    fireEvent.click(within(screen.getByTestId("account-mfa")).getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("Two-step verification is off.")).toBeTruthy();
    expect(put).toHaveBeenLastCalledWith("/api/v1/account/mfa", { required: false });
  });
});
