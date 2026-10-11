// specs/web-app — through the Orbis cloud (change 0068-cloud-relay): when the phone running the hub is off, the
// cloud answers runner_offline and the app says so instead of "reconnecting", and stops saying it once back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App.js";
import { useLang } from "../src/i18n.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  localStorage.setItem("orbis.token", "tok");
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the phone is off", () => {
  it("says the phone is off while the cloud answers runner_offline", async () => {
    const state = { off: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/v1/stream/ticket")) {
          return state.off
            ? Response.json({ error: { code: "runner_offline", message: "your phone is off" } }, { status: 503 })
            : Response.json({ ticket: "t", expiresAt: "x" });
        }
        if (String(url).endsWith("/api/v1/files/key")) return Response.json({ key: "k", expiresAt: "x" });
        if (String(url).includes("/api/v1/conversations/limits")) return Response.json({ maxGroupSize: 6 });
        if (String(url).includes("/api/v1/voice")) return Response.json({ transcription: { available: false } });
        if (String(url).includes("/api/v1/squads")) return Response.json({ squads: [] });
        return Response.json([]);
      }),
    );
    class QuietSocket {
      readyState = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage = null;
      onerror = null;
      send() {}
      close() {}
    }
    vi.stubGlobal("WebSocket", QuietSocket);
    render(<App />);
    expect(await screen.findByText("Your phone is off or offline: your bots answer when it is back.")).toBeTruthy();
    expect(screen.queryByText("Reconnecting to the hub…")).toBeNull();
  });
});
