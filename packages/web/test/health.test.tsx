// specs/web-app — Settings → Health (change 0062-health-connect): inside the Android app, Health Connect is
// allowed through the app and its data synced to the hub; in a browser the screen says where to connect it;
// anywhere it shows what the hub keeps, gives the data to the bots ticked and wipes it; the automatic sync
// runs only when the device chose it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HealthStatus } from "@orbis/shared";
import { Api } from "../src/api.js";
import { HealthSettings } from "../src/components/HealthSettings.js";
import { setHealthAuto, startHealthSync } from "../src/health.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana" });
const status = (over: Partial<HealthStatus> = {}): HealthStatus => ({
  lastSyncAt: "2026-10-07T10:00:00.000Z",
  days: 2,
  firstDate: "2026-10-06",
  lastDate: "2026-10-07",
  sources: ["com.huami.watch.hmwatchmanager"],
  bots: [],
  ...over,
});

type Hooks = { orbisAndroid?: unknown; __orbisHealth?: (a: unknown) => void; __orbisHealthData?: (a: unknown) => void };
const win = window as unknown as Hooks;

/** An Android app whose Health Connect answers at once. */
function fakeApp(state = "available") {
  const app = {
    saveText: vi.fn(),
    changeHub: vi.fn(),
    hubUrl: () => "",
    version: () => "1",
    healthStatus: vi.fn(() => state),
    healthCheck: vi.fn(() => setTimeout(() => win.__orbisHealth?.({ granted: ["android.permission.health.READ_STEPS"], status: "available" }))),
    healthRequest: vi.fn(() => setTimeout(() => win.__orbisHealth?.({ granted: ["android.permission.health.READ_STEPS", "android.permission.health.READ_SLEEP"], status: "available" }))),
    healthRead: vi.fn((days: number) =>
      setTimeout(() => win.__orbisHealthData?.({ days: [{ date: "2026-10-07", metrics: { steps: 4321 + days * 0 } }], sessions: [], sources: ["com.sec.android.app.shealth"] })),
    ),
    openHealthConnect: vi.fn(),
  };
  win.orbisAndroid = app;
  return app;
}

function fakeApi(initial = status()) {
  const api = new Api("tok");
  let current = initial;
  const get = vi.spyOn(api, "get").mockImplementation(async (path: string) =>
    (path.startsWith("/api/v1/health/summary") ? { days: [{ date: "2026-10-07", metrics: { steps: 4321, sleep_minutes: 425, resting_heart_rate: 58 } }], sessions: [] } : current) as never,
  );
  const put = vi.spyOn(api, "put").mockImplementation(async () => (current = status({ days: 3 })) as never);
  const post = vi.spyOn(api, "post").mockImplementation(async (_path, body) => {
    current = status({ bots: (body as { enabled: boolean }).enabled ? [ana.id] : [] });
    return {} as never;
  });
  const del = vi.spyOn(api, "delete").mockImplementation(async () => {
    current = status({ days: 0, lastSyncAt: null, sources: [] });
    return null as never;
  });
  return { api, get, put, post, del };
}

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});
afterEach(() => {
  delete win.orbisAndroid;
  setHealthAuto(false);
  vi.restoreAllMocks();
});

describe("Settings → Health in the Android app", () => {
  it("allows Health Connect through the app, syncs to the hub and says what it keeps", async () => {
    const app = fakeApp();
    const { api, put } = fakeApi();
    render(<HealthSettings api={api} bots={[ana]} />);
    await waitFor(() => expect(screen.getByTestId("health-granted").textContent).toBe("Allowed: 1 of 11 kinds of data."));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change permissions" })));
    await waitFor(() => expect(screen.getByTestId("health-granted").textContent).toBe("Allowed: 2 of 11 kinds of data."));
    expect(app.healthRequest).toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sync now" })));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/health/sync", { days: [{ date: "2026-10-07", metrics: { steps: 4321 } }], sessions: [], sources: ["com.sec.android.app.shealth"] }));
    expect(app.healthRead).toHaveBeenCalledWith(30);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Synced: 3 days with data on the hub."));
    const kept = screen.getByTestId("health-status");
    expect(kept.textContent).toContain("from Zepp (Amazfit)");
    expect(within(kept).getByText("4,321")).toBeTruthy();
    expect(within(kept).getByText("7h05")).toBeTruthy();
    expect(within(kept).getByText("58 bpm")).toBeTruthy();
  });

  it("sends the user to install Health Connect when the phone needs it", async () => {
    const app = fakeApp("update");
    const { api } = fakeApi();
    render(<HealthSettings api={api} bots={[ana]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Install or update Health Connect" }));
    expect(app.openHealthConnect).toHaveBeenCalled();
  });
});

describe("Settings → Health anywhere", () => {
  it("says where to connect it, gives the data to the bots ticked and wipes it", async () => {
    const { api, post, del } = fakeApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HealthSettings api={api} bots={[ana]} />);
    expect((await screen.findByTestId("health-phone")).textContent).toContain("open Orbis in the Android app on your phone");
    const bots = screen.getByTestId("health-bots");
    await act(async () => fireEvent.click(within(bots).getByRole("checkbox", { name: /Ana/ })));
    expect(post).toHaveBeenCalledWith("/api/v1/health/bots", { botId: ana.id, enabled: true });
    await waitFor(() => expect((within(bots).getByRole("checkbox", { name: /Ana/ }) as HTMLInputElement).checked).toBe(true));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete my health data" })));
    expect(del).toHaveBeenCalledWith("/api/v1/health");
    await waitFor(() => expect(screen.getByTestId("health-status").textContent).toContain("No health data yet."));
  });
});

describe("the automatic health sync", () => {
  it("runs only when the device chose it, and in the Android app", async () => {
    const { api, put } = fakeApi();
    // In a browser: nothing.
    startHealthSync(api)();
    fakeApp();
    // In the app but not chosen: nothing.
    startHealthSync(api)();
    expect(put).not.toHaveBeenCalled();
    setHealthAuto(true);
    const stop = startHealthSync(api);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    stop();
  });
});
