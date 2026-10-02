// specs/web-app — the chat-http brain's fields (changes 0029-chat-http-brain, 0033):
// address and Bearer token, typed or read from a pasted cURL; the token is
// saved as the bot's secret, never in the bot. Address and token are made up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatConnectionCheck, ChatTokenGroup } from "@orbis/shared";
import { ChatTokensCard } from "../src/components/ChatTokensCard.js";
import { clampPanel, PanelResizer, usePanelWidth } from "../src/components/PanelResizer.js";
import { BotSettings } from "../src/components/BotSettings.js";
import { NewBotScreen } from "../src/components/NewBotScreen.js";
import { useLang } from "../src/i18n.js";
import { ApiError, type Api } from "../src/api.js";
import { bot } from "./fixtures.js";

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.c2ln`;
const curl = [
  "curl --url 'https://chat.example.com/v1/chat-orchestrator' \\",
  `  -H 'authorization: Bearer ${token}' \\`,
  "  -H 'origin: https://chat.example.com' \\",
  `  --data-raw $'--X\\r\\nContent-Disposition: form-data; name="data"\\r\\n\\r\\n{"agent":{"agentId":"chat-corporativo","version":"1.0.0"},"config":{"modelId":"claude-4-6-opus","temperature":0.25}}\\r\\n--X--\\r\\n'`,
].join("\n");

/** What the hub says of a bot's token: none saved, or one saved that names no expiry. */
const NO_TOKEN = { saved: false, expiresAt: null, expired: false };
const SAVED = { saved: true, expiresAt: null, expired: false };

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("the chat-http brain in a bot's settings", () => {
  it("reads a pasted cURL, saves the token as its chat API's shared token and the rest in the brain", async () => {
    const put = vi.fn(async () => ({ name: "CHAT_BEARER_TOKEN" }));
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? NO_TOKEN : Promise.reject(new Error("not in this test"))));
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
    expect(put).toHaveBeenCalledWith("/api/v1/chat-http/tokens", { origin: "https://chat.example.com", value: token });
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
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
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
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
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
    expect(put).toHaveBeenCalledWith("/api/v1/chat-http/tokens", { origin: "https://chat.example.com", value: token });
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: { baseUrl: string; chat: { historyUrl: string } } }])[0];
    expect(patch.brain.baseUrl).toBe("https://chat.example.com/v1/chat-orchestrator");
    expect(patch.brain.chat.historyUrl).toBe("https://chat.example.com/v1/history/chats");
  });
});

describe("titles of new chats", () => {
  it("are on by default, and the bot can be set not to give them", async () => {
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
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

describe("the saved token and the browser's headers (audit of change 0033)", () => {
  const settings = (
    status: () => Promise<unknown>,
    brain = { kind: "chat-http" as const, baseUrl: "https://chat.example.com/v1/chat", apiKeySecret: "CHAT_BEARER_TOKEN" },
  ) => {
    const put = vi.fn(async () => ({ name: "CHAT_BEARER_TOKEN" }));
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana", brain });
    render(
      <BotSettings
        api={
          {
            put,
            get: vi.fn(async (path: string) => (path.endsWith("/chat-token") ? status() : Promise.reject(new Error("not in this test")))),
          } as unknown as Api
        }
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    return { put, onSave, ana };
  };

  it("shows that a token is saved and when it expires, or that none is", async () => {
    const exp = new Date(Date.now() + 3 * 3600_000);
    settings(async () => ({ saved: true, expiresAt: exp.toISOString(), expired: false }));
    await act(async () => undefined);
    expect(screen.getByText(/^✓ Token saved in the vault · expires at /)).toBeTruthy();
  });

  it("warns when the saved token expired", async () => {
    const gone = new Date(Date.now() - 3600_000);
    settings(async () => ({ saved: true, expiresAt: gone.toISOString(), expired: true }));
    await act(async () => undefined);
    expect(screen.getByText(/^⚠ Token saved, but it expired at /)).toBeTruthy();
  });

  it("says no token is saved yet", async () => {
    settings(async () => NO_TOKEN);
    await act(async () => undefined);
    expect(screen.getByText("No token saved yet")).toBeTruthy();
  });

  it("shows the saved token as saved right after saving a pasted one, cleaned of what came with it", async () => {
    const { put, onSave, ana } = settings(async () => NO_TOKEN);
    await act(async () => undefined);
    fireEvent.change(screen.getByLabelText(/^Bearer token/), { target: { value: `Authorization: Bearer ${token}\n` } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(put).toHaveBeenCalledWith("/api/v1/chat-http/tokens", { origin: "https://chat.example.com", value: token });
    expect(onSave).toHaveBeenCalled();
    expect((screen.getByLabelText(/^Bearer token/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/^✓ This API's shared token · expires at /)).toBeTruthy();
  });

  it("copies the browser's headers from a pasted cURL, never a cookie or another token", async () => {
    const { onSave } = settings(async () => NO_TOKEN);
    await act(async () => undefined);
    expect(screen.getByTestId("chat-http-headers").textContent).toMatch(/^No browser headers copied/);
    const withHeaders = [
      "curl --url 'https://chat.example.com/v1/chat-orchestrator' \\",
      `  -H 'authorization: Bearer ${token}' \\`,
      "  -H 'referer: https://app.example.com/chat' \\",
      "  -H 'user-agent: Mozilla/5.0 (made up)' \\",
      "  -H 'accept-language: pt-BR' \\",
      '  -H \'sec-ch-ua: "Chromium";v="154"\' \\',
      "  -H 'sec-fetch-mode: cors' \\",
      "  -H 'cookie: session=do-not-keep' \\",
      "  -H 'x-api-key: do-not-keep-either' \\",
      "  --data-raw $'--X\\r\\nContent-Disposition: form-data; name=\"data\"\\r\\n\\r\\n{}\\r\\n--X--\\r\\n'",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Paste the cURL command (optional)"), { target: { value: withHeaders } });
    fireEvent.click(screen.getByRole("button", { name: "Fill in from the cURL" }));
    expect(screen.getByTestId("chat-http-headers").textContent).toMatch(
      /^Browser headers to send \(5\): user-agent, accept-language, referer, sec-ch-ua, sec-fetch-mode/,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: { chat: { headers: Record<string, string> } } }])[0];
    expect(patch.brain.chat.headers).toEqual({
      "user-agent": "Mozilla/5.0 (made up)",
      "accept-language": "pt-BR",
      referer: "https://app.example.com/chat",
      "sec-ch-ua": '"Chromium";v="154"',
      "sec-fetch-mode": "cors",
    });
    expect(JSON.stringify(patch)).not.toContain("do-not-keep");
  });

  it("lets the headers be removed", async () => {
    const { onSave } = settings(async () => SAVED, {
      kind: "chat-http" as const,
      baseUrl: "https://chat.example.com/v1/chat",
      apiKeySecret: "CHAT_BEARER_TOKEN",
      chat: { headers: { referer: "https://app.example.com/chat" } },
    } as never);
    await act(async () => undefined);
    expect(screen.getByTestId("chat-http-headers").textContent).toMatch(/^Browser headers to send \(1\): referer/);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: Record<string, unknown> }])[0];
    expect(patch.brain.chat).toBeUndefined();
  });
});

describe("how the requests are made (change 0035)", () => {
  it("is automatic by default, and a bot can be set to Node's fetch", async () => {
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
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
    await act(async () => undefined);
    const select = screen.getByLabelText("HTTP call") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      "Automatic (curl, if installed)",
      "curl (gets past firewalls that block Node)",
      "Node (fetch)",
    ]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((onSave.mock.calls[0] as unknown as [{ brain: Record<string, unknown> }])[0].brain.chat).toBeUndefined();
    fireEvent.change(select, { target: { value: "fetch" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((onSave.mock.calls[1] as unknown as [{ brain: { chat: unknown } }])[0].brain.chat).toEqual({ transport: "fetch" });
  });
});

describe("the connection test (change 0037)", () => {
  it("shows each way to the API and what the firewall said, and uses the one that got through", async () => {
    const check: ChatConnectionCheck = {
      url: "https://chat.example.com/v1/history/chats",
      proxies: { windows: "http://proxy.company.example:8080", env: null },
      results: [
        {
          transport: "curl",
          curl: "C:\\Windows\\System32\\curl.exe",
          proxy: "http://proxy.company.example:8080",
          verdict: "ok",
          status: 200,
          detail: "",
          ms: 300,
        },
        {
          transport: "curl",
          curl: "C:\\Windows\\System32\\curl.exe",
          proxy: "direct",
          verdict: "blocked",
          status: 403,
          detail: "Attention Required! | Cloudflare",
          ms: 120,
        },
        { transport: "fetch", curl: null, proxy: null, verdict: "blocked", status: 403, detail: "Attention Required! | Cloudflare", ms: 90 },
      ],
    };
    const post = vi.fn(async () => check);
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
    const onSave = vi.fn(async () => undefined);
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1/chat", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={{ put: vi.fn(), get, post } as unknown as Api}
        bot={ana}
        onSave={onSave}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => undefined);
    const box = screen.getByTestId("chat-check");
    expect(box.textContent).toContain("sends no message and costs no model call");
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Test connection" })));
    expect(post).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/chat-check`, {});
    const results = within(box).getByRole("status");
    expect(results.textContent).toContain("Windows proxy: http://proxy.company.example:8080 · environment proxy: none");
    const rows = within(results)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows[0]).toMatch(/^✓ curl — C:\\Windows\\System32\\curl\.exe · proxy http:\/\/proxy\.company\.example:8080 — got through \(HTTP 200\)/);
    expect(rows[1]).toMatch(/^✗ curl — .* · no proxy — blocked by the firewall \(HTTP 403\)/);
    expect(rows[2]).toMatch(/^✗ Node \(fetch\) · no proxy — blocked by the firewall/);
    // Only the way that got through can be chosen; choosing it fills the settings, and saving keeps them.
    expect(within(results).getAllByRole("button", { name: "Use this way" })).toHaveLength(1);
    fireEvent.click(within(results).getByRole("button", { name: "Use this way" }));
    expect(results.textContent).toContain("Way chosen — save to apply.");
    expect((screen.getByLabelText("Proxy (optional)") as HTMLInputElement).value).toBe("http://proxy.company.example:8080");
    expect((screen.getByLabelText("curl program (optional)") as HTMLInputElement).value).toBe("C:\\Windows\\System32\\curl.exe");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((onSave.mock.calls[0] as unknown as [{ brain: { chat: unknown } }])[0].brain.chat).toEqual({
      transport: "curl",
      curl: "C:\\Windows\\System32\\curl.exe",
      proxy: "http://proxy.company.example:8080",
    });
  });

  it("says when no way got through", async () => {
    const post = vi.fn(
      async (): Promise<ChatConnectionCheck> => ({
        url: "https://chat.example.com/v1/history/chats",
        proxies: { windows: null, env: null },
        results: [{ transport: "fetch", curl: null, proxy: null, verdict: "error", status: null, detail: "ENOTFOUND", ms: 5 }],
      }),
    );
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1/chat", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={{ put: vi.fn(), get, post } as unknown as Api}
        bot={ana}
        onSave={async () => undefined}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => undefined);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Test connection" })));
    expect(screen.getByTestId("chat-check").textContent).toContain("no answer: ENOTFOUND");
    expect(screen.getByTestId("chat-check").textContent).toContain("No way got past the firewall");
  });
});

describe("plain chat and the errors of a save (change 0038)", () => {
  it("is off by default, explained, and saved when turned on", async () => {
    const get = vi.fn(async (path: string) => (path.endsWith("/chat-token") ? SAVED : Promise.reject(new Error("not in this test"))));
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
    await act(async () => undefined);
    const box = screen.getByLabelText("Plain chat (no tools)") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText(/the company's firewall blocks the bot's messages/)).toBeTruthy();
    fireEvent.click(box);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((onSave.mock.calls[0] as unknown as [{ brain: { chat: unknown } }])[0].brain.chat).toEqual({ plain: true });
  });

  it("names the field the hub refused", () => {
    const err = new ApiError(400, {
      error: { code: "invalid_request", message: "the request does not match its schema", fields: { "brain.chat.curl": "must match pattern" } },
    });
    expect(err.message).toBe("the request does not match its schema (brain.chat.curl: must match pattern)");
    expect(new ApiError(500, null).message).toBe("HTTP 500");
  });
});

describe("one token per chat API (change 0039)", () => {
  const groups = (saved: boolean, expiresAt: string | null = null): ChatTokenGroup[] => [
    {
      origin: "https://chat.example.com",
      token: { saved, expiresAt, expired: false, source: saved ? "shared" : null },
      bots: [
        { id: "bot_a", name: "Ana", handle: "ana" },
        { id: "bot_b", name: "Bia", handle: "bia" },
      ],
    },
  ];

  it("changes the token of every bot of an API in one place, from a token or a cURL", async () => {
    const exp = new Date(Date.now() + 3600_000).toISOString();
    const put = vi.fn(async () => groups(true, exp));
    const api = { get: vi.fn(async () => groups(false)), put } as unknown as Api;
    render(<ChatTokensCard api={api} />);
    const card = await screen.findByTestId("chat-tokens");
    expect(card.textContent).toContain("No token saved for this API");
    expect(card.textContent).toContain("Used by: Ana, Bia");
    const box = within(card).getByLabelText("New token or cURL for https://chat.example.com");
    fireEvent.change(box, { target: { value: curl } });
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Save for this API's bots (2)" })));
    expect(put).toHaveBeenCalledWith("/api/v1/chat-http/tokens", { origin: "https://chat.example.com", value: token });
    expect(within(card).getByRole("status").textContent).toMatch(/^Token saved: it applies to this API's 2 bots \(expires at .+\)\.$/);
    expect(card.textContent).toMatch(/This API's shared token · expires at/);
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses a cURL of another API, and text with no token", async () => {
    const put = vi.fn();
    render(<ChatTokensCard api={{ get: vi.fn(async () => groups(true)), put } as unknown as Api} />);
    const card = await screen.findByTestId("chat-tokens");
    const box = within(card).getByLabelText("New token or cURL for https://chat.example.com");
    fireEvent.change(box, { target: { value: curl.replace("chat.example.com/v1", "other.example.com/v1") } });
    fireEvent.click(within(card).getByRole("button", { name: /Save for this API's bots/ }));
    expect(within(card).getByRole("status").textContent).toBe("That cURL is for another API (https://other.example.com).");
    fireEvent.change(box, { target: { value: "Bearer " } });
    fireEvent.click(within(card).getByRole("button", { name: /Save for this API's bots/ }));
    expect(within(card).getByRole("status").textContent).toBe("No token found in that.");
    expect(put).not.toHaveBeenCalled();
  });

  it("is not shown when no bot uses a chat API", async () => {
    render(<ChatTokensCard api={{ get: vi.fn(async () => []) } as unknown as Api} />);
    await act(async () => undefined);
    expect(screen.queryByTestId("chat-tokens")).toBeNull();
  });

  it("lets a new bot of an API that has a token skip the token", async () => {
    const onCreate = vi.fn(async () => undefined);
    render(
      <NewBotScreen
        api={{ get: vi.fn(async (path: string) => (path === "/api/v1/chat-http/tokens" ? groups(true) : [])) } as unknown as Api}
        bots={[]}
        onCreate={onCreate}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cid" } });
    fireEvent.change(screen.getByLabelText("Brain"), { target: { value: "chat-http" } });
    await act(async () => undefined);
    fireEvent.change(screen.getByLabelText("Request address (URL)"), { target: { value: "https://chat.example.com/v1/chat" } });
    expect((screen.getByLabelText(/^Bearer token/) as HTMLInputElement).required).toBe(false);
    expect(screen.getByText("✓ This API's shared token")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create bot" })));
    expect(onCreate).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything() }));
  });

  it("asks for the address before a token, since the token belongs to the address's API", async () => {
    const put = vi.fn();
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={{ put, get: vi.fn(async (path: string) => (path.endsWith("/chat-token") ? NO_TOKEN : Promise.reject(new Error("x")))) } as unknown as Api}
        bot={ana}
        onSave={async () => undefined}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => undefined);
    fireEvent.change(screen.getByLabelText(/^Bearer token/), { target: { value: token } });
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
    await act(async () => fireEvent.submit(form));
    expect(screen.getByText(/Type the request address before saving the token/)).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("says a bot uses its own token from before, until its API has a shared one", async () => {
    const ana = bot({ name: "Ana", brain: { kind: "chat-http", baseUrl: "https://chat.example.com/v1/chat", apiKeySecret: "CHAT_BEARER_TOKEN" } });
    render(
      <BotSettings
        api={
          {
            put: vi.fn(),
            get: vi.fn(async (path: string) =>
              path.endsWith("/chat-token")
                ? { saved: true, expiresAt: new Date(Date.now() + 3600_000).toISOString(), expired: false, source: "bot" }
                : Promise.reject(new Error("x")),
            ),
          } as unknown as Api
        }
        bot={ana}
        onSave={async () => undefined}
        onExport={async () => undefined}
        onDuplicate={async () => undefined}
        onDelete={async () => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => undefined);
    expect(screen.getByText(/^✓ This bot's own token \(from before\) · expires at .+ — save a new one to apply it to every bot of this API$/)).toBeTruthy();
  });
});

describe("the side panel's width (change 0039)", () => {
  it("is dragged or moved with the keys within limits, remembered, and reset by a double-click", () => {
    window.localStorage.removeItem("orbis.panelWidth");
    Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
    function Harness() {
      const [width, setWidth] = usePanelWidth();
      return <PanelResizer width={width} onWidth={setWidth} />;
    }
    render(<Harness />);
    const handle = screen.getByRole("separator", { name: /Panel width/ });
    expect(handle.getAttribute("aria-valuenow")).toBe("360");
    expect(handle.getAttribute("aria-valuemax")).toBe("940"); // 1600 − 300 sidebar − 360 for the chat
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("460");
    expect(window.localStorage.getItem("orbis.panelWidth")).toBe("460");
    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 900, pointerId: 1 });
    expect(handle.getAttribute("aria-valuenow")).toBe("700"); // 1600 − 900
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle.getAttribute("aria-valuenow")).toBe("940");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("360");
  });

  it("keeps a remembered width within the window", () => {
    window.localStorage.setItem("orbis.panelWidth", "5000");
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    expect(clampPanel(5000, 1200)).toBe(540);
    expect(clampPanel(100, 1200)).toBe(300);
    function Harness() {
      const [width] = usePanelWidth();
      return <span data-testid="w">{width}</span>;
    }
    render(<Harness />);
    expect(screen.getByTestId("w").textContent).toBe("540");
    window.localStorage.removeItem("orbis.panelWidth");
  });
});
