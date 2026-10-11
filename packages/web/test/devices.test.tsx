// specs/web-app — Settings → Account, the devices (change 0066-runner-link): linking this hub as a device of the
// account, what it sent, sending now, unlinking, and the account's devices listed and revoked with its session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DeviceStatus } from "@orbis/shared";
import { Api } from "../src/api.js";
import { DeviceSettings } from "../src/components/DeviceSettings.js";
import { useLang } from "../src/i18n.js";

const project = { url: "https://proj.supabase.co", key: "sb_publishable_x" };
const off: DeviceStatus = { available: true, linked: null, pending: 0, lastSyncAt: null, lastError: null, revoked: false, cloud: { url: null, connected: false, lastError: null } };
const on: DeviceStatus = {
  ...off,
  linked: { id: "dev-1", name: "Celular", ownerId: "u1", email: "ana@example.com", linkedAt: "2026-10-08T12:00:00.000Z" },
  pending: 3,
  lastSyncAt: "2026-10-08T12:05:00.000Z",
  cloud: { url: "https://orbis.example.workers.dev", connected: true, lastError: null },
};

/** The hub's config and the cloud: sign-in and the devices table, recording every request. */
function cloud() {
  const requests: Array<{ url: string; method: string; body: string | null; auth: string | null }> = [];
  let devices: Array<{ id: string; name: string; last_seen_at: string | null; revoked_at: string | null; created_at: string }> = [
    { id: "dev-1", name: "Celular", last_seen_at: "2026-10-08T12:05:00.000Z", revoked_at: null, created_at: "2026-10-08T12:00:00.000Z" },
    { id: "dev-0", name: "Celular antigo", last_seen_at: "2026-09-01T10:00:00.000Z", revoked_at: null, created_at: "2026-09-01T10:00:00.000Z" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      requests.push({ url, method: init.method ?? "GET", body: (init.body as string) ?? null, auth: headers.authorization ?? null });
      if (url.endsWith("/api/v1/auth/config")) return Response.json({ supabase: project, linked: true });
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "account-session", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "ana@example.com" } });
      if (url.includes("/rest/v1/devices") && init.method === "PATCH") {
        devices = devices.map((d) => (url.includes(`eq.${d.id}`) ? { ...d, revoked_at: "2026-10-08T13:00:00.000Z" } : d));
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/devices")) return Response.json(devices);
      return Response.json({});
    }),
  );
  return { requests };
}

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Settings → Account, devices", () => {
  it("links this hub with the account's email and password, shows what it sent, sends now and unlinks", async () => {
    cloud();
    const api = new Api("tok");
    let status = off;
    vi.spyOn(api, "get").mockImplementation(async () => status as never);
    const post = vi.spyOn(api, "post").mockImplementation(async (path: string) => (status = path.endsWith("/link") ? on : { ...on, pending: 0 }) as never);
    const del = vi.spyOn(api, "delete").mockImplementation(async () => (status = off) as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeviceSettings api={api} />);
    const box = await screen.findByTestId("device-this");
    fireEvent.change(within(box).getByLabelText("Device name"), { target: { value: "Celular" } });
    fireEvent.change(within(box).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(within(box).getByLabelText("Password"), { target: { value: "a long password" } });
    fireEvent.click(within(box).getByRole("button", { name: "Link this hub to my account" }));
    await waitFor(() => expect(within(screen.getByTestId("device-this")).getByText('Device "Celular" of the account ana@example.com.')).toBeTruthy());
    expect(post).toHaveBeenCalledWith("/api/v1/device/link", { name: "Celular", email: "ana@example.com", password: "a long password" });
    expect(screen.getByTestId("device-this").textContent).toContain("Waiting to send: 3");
    expect(screen.getByTestId("device-cloud").textContent).toBe("Cloud: connected to https://orbis.example.workers.dev");

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    await waitFor(() => expect(screen.getByTestId("device-this").textContent).toContain("Waiting to send: 0"));
    fireEvent.click(screen.getByRole("button", { name: "Unlink this device" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/device"));
    expect(await screen.findByRole("button", { name: "Link this hub to my account" })).toBeTruthy();
  });

  it("says when the account revoked this device", async () => {
    cloud();
    const api = new Api("tok");
    vi.spyOn(api, "get").mockResolvedValue({ ...on, revoked: true } as never);
    render(<DeviceSettings api={api} />);
    expect((await screen.findByTestId("device-this")).textContent).toContain("The account revoked this device");
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
  });

  it("lists the account's devices with its session and revokes one", async () => {
    const { requests } = cloud();
    const api = new Api("tok");
    vi.spyOn(api, "get").mockResolvedValue(on as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const account = { token: vi.fn(async () => "account-session") } as never;
    render(<DeviceSettings api={api} account={account} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show my devices" }));
    const list = await screen.findByRole("list");
    expect(within(list).getByText("Celular").closest("li")!.textContent).toContain("this hub");
    const old = within(list).getByText("Celular antigo").closest("li")!;
    fireEvent.click(within(old).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(within(screen.getByRole("list")).getByText("Celular antigo").closest("li")!.textContent).toContain("revoked on"));
    const patch = requests.find((r) => r.method === "PATCH")!;
    expect(patch.url).toBe("https://proj.supabase.co/rest/v1/devices?id=eq.dev-0");
    expect(patch.auth).toBe("Bearer account-session");
    expect(JSON.parse(patch.body!)).toHaveProperty("revoked_at");
  });
});
