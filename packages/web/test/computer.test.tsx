// specs/web-app and specs/computer — the computer side panel: status, actions,
// takeover banner and the live screenshot.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComputerStatus } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { ComputerPanel } from "../src/components/ComputerPanel.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA" });
const status = (over: Partial<ComputerStatus> = {}): ComputerStatus => ({
  botId: ana.id,
  enabled: true,
  provider: "local",
  status: "running",
  takeover: false,
  vncPath: null,
  lastUsedAt: null,
  screenshotAt: "2026-09-27T10:00:00.000Z",
  ...over,
});

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:screenshot-1");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

function fakeApi() {
  const blob = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
  const post = vi.fn(async () => ({ url: "/api/v1/bots/bot_ana/computer/vnc/vnc.html?autoconnect=1" }));
  return { api: { blob, post, get: vi.fn() } as unknown as Api, blob, post };
}

describe("computer panel", () => {
  it("shows the state, the latest screenshot and the actions; Take over and Hand back call the API", async () => {
    const { api, blob } = fakeApi();
    const onAction = vi.fn(async () => undefined);
    const { rerender } = render(
      <ComputerPanel api={api} bot={ana} status={status()} fullscreen={false} onAction={onAction} onFullscreen={() => undefined} onClose={() => undefined} />,
    );
    expect(screen.getByText("Ana's computer")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText(/not a security boundary/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("computer-screenshot").getAttribute("src")).toBe("blob:screenshot-1"));
    expect(blob).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/computer/screenshot`);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Take over" })));
    expect(onAction).toHaveBeenCalledWith("takeover");

    rerender(
      <ComputerPanel api={api} bot={ana} status={status({ takeover: true })} fullscreen={false} onAction={onAction} onFullscreen={() => undefined} onClose={() => undefined} />,
    );
    expect(screen.getByRole("status").textContent).toContain("You are in control: Ana's tools wait until you hand it back.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hand back" })));
    expect(onAction).toHaveBeenCalledWith("release");

    // A new screenshot (screenshotAt changes) is fetched again.
    rerender(
      <ComputerPanel api={api} bot={ana} status={status({ screenshotAt: "2026-09-27T10:00:05.000Z" })} fullscreen={false} onAction={onAction} onFullscreen={() => undefined} onClose={() => undefined} />,
    );
    await waitFor(() => expect(blob).toHaveBeenCalledTimes(2));
  });

  it("shows noVNC for a desktop computer and switches to full screen", async () => {
    const { api, post } = fakeApi();
    const onFullscreen = vi.fn();
    render(
      <ComputerPanel
        api={api}
        bot={ana}
        status={status({ provider: "docker", vncPath: `/api/v1/bots/${ana.id}/computer/vnc/vnc.html` })}
        fullscreen={false}
        onAction={async () => undefined}
        onFullscreen={onFullscreen}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("computer-vnc").getAttribute("src")).toContain("vnc.html?autoconnect=1"));
    expect(post).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/computer/vnc-session`);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(onFullscreen).toHaveBeenCalledWith(true);
  });

  it("says when the computer is disabled", () => {
    const { api } = fakeApi();
    render(<ComputerPanel api={api} bot={ana} status={status({ enabled: false })} fullscreen={false} onAction={async () => undefined} onFullscreen={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText("This bot's computer is disabled in its settings.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
  });
});
