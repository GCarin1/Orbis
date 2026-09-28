// specs/web-app — the three kinds of computer (change 0017-computer-modes): the
// per-bot choice with the folder and the consent for "My computer", Docker's
// state and the one-click image, the settings tab, and the mode in the panel.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComputerProvidersInfo, ComputerStatus } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { BotPanel } from "../src/components/BotPanel.js";
import { BotSettings } from "../src/components/BotSettings.js";
import { ComputersSettings } from "../src/components/ComputerModes.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

function fakeApi(docker: Partial<ComputerProvidersInfo["docker"]> = {}) {
  let info: ComputerProvidersInfo = {
    default: "local",
    local: { available: true },
    host: { available: true, home: "/home/ana", platform: "linux", visibleBrowser: true },
    docker: {
      available: true,
      installed: true,
      version: "27.3.1",
      error: null,
      image: "orbis/desktop:latest",
      imagePresent: false,
      canBuild: true,
      build: { state: "idle", startedAt: null, finishedAt: null, log: "", error: null },
      ...docker,
    },
  };
  const post = vi.fn(async () => {
    info = { ...info, docker: { ...info.docker, imagePresent: true, build: { ...info.docker.build, state: "done" } } };
    return info.docker.build;
  });
  const api = { get: vi.fn(async () => info), post, blob: vi.fn(async () => null) } as unknown as Api;
  return { api, post };
}

const settings = (api: Api, onSave = vi.fn(async (_patch: object) => undefined), b = bot({ name: "Ana" })) => {
  render(<BotSettings api={api} bot={b} onSave={onSave} onExport={async () => undefined} onDuplicate={async () => undefined} onDelete={async () => undefined} onClose={() => undefined} />);
  return { onSave, panel: screen.getByTestId("settings-panel") };
};

describe("choosing a bot's computer", () => {
  it("offers three kinds, and gives the user's computer only with a folder and an explicit consent", async () => {
    const { api } = fakeApi();
    const { onSave, panel } = settings(api);
    const cards = within(panel).getAllByRole("radio").filter((r) => r.classList.contains("mode-card"));
    expect(cards.map((c) => c.querySelector("strong")!.textContent)).toEqual(["Private folder", "My computer", "Container (Docker)"]);
    expect(within(panel).getByTestId("mode-local").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(within(panel).getByTestId("mode-host"));
    await waitFor(() => expect((within(panel).getByLabelText("Folder it works in") as HTMLInputElement).placeholder).toBe("/home/ana"));
    fireEvent.change(within(panel).getByLabelText("Folder it works in"), { target: { value: "/home/ana/projects" } });
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/Confirm that this bot may use your computer/);

    fireEvent.click(within(panel).getByLabelText(/I understand this bot will be able to read, create, change and delete files/));
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ computer: expect.objectContaining({ enabled: true, provider: "host", hostDir: "/home/ana/projects" }) }));
  });

  it("does not ask again for a bot that already has the user's computer, and drops the folder when it moves to a container", async () => {
    const { api } = fakeApi();
    const { onSave, panel } = settings(api, undefined, bot({ name: "Hana", computer: { enabled: true, provider: "host", hostDir: "/home/ana/work" } }));
    expect(within(panel).queryByLabelText(/I understand/)).toBeNull();
    fireEvent.click(within(panel).getByTestId("mode-docker"));
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));
    const patch = onSave.mock.calls[0]![0] as { computer: Record<string, unknown> };
    expect(patch.computer.provider).toBe("docker");
    expect(patch.computer.hostDir).toBeUndefined();
  });

  it("shows Docker's state and prepares the desktop image with one click", async () => {
    const { api, post } = fakeApi();
    const { panel } = settings(api);
    fireEvent.click(within(panel).getByTestId("mode-docker"));
    const status = await within(panel).findByTestId("docker-status");
    await waitFor(() => expect(status.textContent).toContain("Docker 27.3.1 running"));
    expect(status.textContent).toContain("orbis/desktop image not prepared yet");
    await act(async () => fireEvent.click(within(status).getByRole("button", { name: "Prepare image" })));
    expect(post).toHaveBeenCalledWith("/api/v1/computers/docker/image");
    await waitFor(() => expect(status.textContent).toContain("orbis/desktop image ready"));
  });
});

describe("the computers tab", () => {
  it("explains the three kinds and what Docker needs here", async () => {
    const { api } = fakeApi({ available: false, installed: false, version: null, error: "Docker is not installed (or not on PATH)" });
    render(<ComputersSettings api={api} />);
    const tab = screen.getByTestId("computers-settings");
    expect(within(tab).getByTestId("computers-local").textContent).toContain("Private folder");
    await waitFor(() => expect(within(tab).getByTestId("computers-host").textContent).toContain("Default folder: /home/ana."));
    expect(within(tab).getByTestId("computers-docker").textContent).toMatch(/Docker not found.*Install Docker Desktop/);
    expect(within(tab).queryByRole("button", { name: "Prepare image" })).toBeNull();
  });

  it("names the kind of computer under the bot's screen", () => {
    const { api } = fakeApi();
    const hana = bot({ name: "Hana", computer: { enabled: true, provider: "host", hostDir: "/home/ana/work" } });
    const status = { botId: hana.id, enabled: true, provider: "host", status: "stopped", takeover: false, vncPath: null, lastUsedAt: null, screenshotAt: null } as ComputerStatus;
    render(
      <BotPanel
        api={api}
        bot={hana}
        bots={{ [hana.id]: hana }}
        status={status}
        routines={[]}
        onLoadRoutines={async () => undefined}
        onOpenComputer={() => undefined}
        onOpenRoutines={() => undefined}
        onOpenSettings={() => undefined}
        onOpenBot={() => undefined}
        onExport={async () => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("computer-mode").textContent).toBe("💻 My computer · /home/ana/work");
  });
});
