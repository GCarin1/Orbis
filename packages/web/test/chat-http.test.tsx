// specs/web-app — the chat-http brain's fields (change 0029-chat-http-brain):
// address and Bearer token, typed or read from a pasted cURL; the token is
// saved as the bot's secret, never in the bot. Address and token are made up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BotSettings } from "../src/components/BotSettings.js";
import { NewBotScreen } from "../src/components/NewBotScreen.js";
import { useLang } from "../src/i18n.js";
import type { Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.c2ln`;
const curl = [
  "curl --url 'https://chat.example.com/v1/chat-orchestrator' \\",
  `  -H 'authorization: Bearer ${token}' \\`,
  "  -H 'origin: https://chat.example.com' \\",
  `  --data-raw $'--X\\r\\nContent-Disposition: form-data; name="data"\\r\\n\\r\\n{"agent":{"agentId":"chat-corporativo","version":"1.0.0"},"config":{"modelId":"claude-4-6-opus","temperature":0.25}}\\r\\n--X--\\r\\n'`,
].join("\n");

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("the chat-http brain in a bot's settings", () => {
  it("reads a pasted cURL, saves the token as the bot's secret and the rest in the brain", async () => {
    const put = vi.fn(async () => ({ name: "CHAT_BEARER_TOKEN" }));
    const get = vi.fn(async (path: string) => (path.endsWith("/secrets") ? [] : Promise.reject(new Error("not in this test"))));
    const api = { put, get } as unknown as Api;
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana" });
    render(
      <BotSettings
        api={api}
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Brain"), { target: { value: "chat-http" } });
    fireEvent.change(screen.getByLabelText("Paste the cURL command (optional)"), { target: { value: curl } });
    fireEvent.click(screen.getByRole("button", { name: "Fill in from the cURL" }));
    expect(screen.getByRole("status").textContent).toMatch(/^Address and token read \(the token expires at .+\) — save to apply\.$/);
    // The command (it holds the token) does not stay on screen.
    expect((screen.getByLabelText("Paste the cURL command (optional)") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Request address (URL)") as HTMLInputElement).value).toBe("https://chat.example.com/v1/chat-orchestrator");
    expect((screen.getByLabelText(/^Bearer token/) as HTMLInputElement).type).toBe("password");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(put).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/secrets/CHAT_BEARER_TOKEN`, { value: token });
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: Record<string, unknown> }])[0];
    expect(patch.brain).toEqual({
      kind: "chat-http",
      baseUrl: "https://chat.example.com/v1/chat-orchestrator",
      apiKeySecret: "CHAT_BEARER_TOKEN",
      model: "claude-4-6-opus",
      chat: { agentId: "chat-corporativo", agentVersion: "1.0.0", temperature: 0.25, origin: "https://chat.example.com" },
    });
    expect(JSON.stringify(patch)).not.toContain(token);
  });

  it("keeps a saved token when the field is left empty, and the brain's time and step limits", async () => {
    const put = vi.fn();
    const get = vi.fn(async (path: string) =>
      path.endsWith("/secrets") ? [{ name: "CHAT_BEARER_TOKEN", createdAt: "" }] : Promise.reject(new Error("not in this test")),
    );
    const onSave = vi.fn(async () => undefined);
    const ana = bot({
      name: "Ana",
      brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1", apiKeySecret: "CHAT_BEARER_TOKEN", timeoutSec: 1800, maxSteps: 40 },
    });
    render(
      <BotSettings
        api={{ put, get } as unknown as Api}
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => undefined);
    expect((screen.getByLabelText(/^Bearer token/) as HTMLInputElement).placeholder).toBe("•••• saved — paste a new one to replace it");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(put).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brain: expect.objectContaining({ kind: "chat-http", timeoutSec: 1800, maxSteps: 40 }) }));
  });
});

describe("a new bot with the chat-http brain", () => {
  it("hands the token apart from the bot", async () => {
    const onCreate = vi.fn(async () => undefined);
    render(<NewBotScreen bots={[]} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Analista" } });
    fireEvent.change(screen.getByLabelText("Brain"), { target: { value: "chat-http" } });
    fireEvent.change(screen.getByLabelText("Request address (URL)"), { target: { value: "https://chat.example.com/v1" } });
    fireEvent.change(screen.getByLabelText(/^Bearer token/), { target: { value: `Bearer ${token}` } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create bot" })));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ token, brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1", apiKeySecret: "CHAT_BEARER_TOKEN" } }),
    );
  });
});

describe("a pasted cURL that only reads (the history)", () => {
  it("keeps the request address, takes the new token and the history's address", async () => {
    const put = vi.fn(async () => ({ name: "CHAT_BEARER_TOKEN" }));
    const get = vi.fn(async (path: string) =>
      path.endsWith("/secrets") ? [{ name: "CHAT_BEARER_TOKEN", createdAt: "" }] : Promise.reject(new Error("not in this test")),
    );
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1/chat-orchestrator", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={{ put, get } as unknown as Api}
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    const history = `curl --url 'https://chat.example.com/v1/history/chats/0000cccc-3333-7000' \\\n  -H 'authorization: Bearer ${token}'`;
    fireEvent.change(screen.getByLabelText("Paste the cURL command (optional)"), { target: { value: history } });
    fireEvent.click(screen.getByRole("button", { name: "Fill in from the cURL" }));
    expect(screen.getByRole("status").textContent).toMatch(/^That cURL reads the history \(GET\): its token and the history's address were taken\./);
    expect((screen.getByLabelText("Request address (URL)") as HTMLInputElement).value).toBe("https://chat.example.com/v1/chat-orchestrator");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(put).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/secrets/CHAT_BEARER_TOKEN`, { value: token });
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: { baseUrl: string; chat: { historyUrl: string } } }])[0];
    expect(patch.brain.baseUrl).toBe("https://chat.example.com/v1/chat-orchestrator");
    expect(patch.brain.chat.historyUrl).toBe("https://chat.example.com/v1/history/chats");
  });
});

describe("titles of new chats", () => {
  it("are on by default, and the bot can be set not to give them", async () => {
    const get = vi.fn(async (path: string) =>
      path.endsWith("/secrets") ? [{ name: "CHAT_BEARER_TOKEN", createdAt: "" }] : Promise.reject(new Error("not in this test")),
    );
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1/chat", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={{ put: vi.fn(), get } as unknown as Api}
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    // The saved token is known once the secrets load.
    await act(async () => undefined);
    const box = screen.getByLabelText(/^Give new chats a title/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brain: expect.objectContaining({ chat: { titles: false } }) }));
  });
});
