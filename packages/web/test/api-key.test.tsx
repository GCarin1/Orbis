// specs/web-app, specs/secrets — an API brain's key: typed in the bot's settings or the new-bot screen,
// kept in the bot's vault, never in the bot; how it is sent (Bearer or api-key) and {model} in the address.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BotSettings } from "../src/components/BotSettings.js";
import { NewBotScreen } from "../src/components/NewBotScreen.js";
import type { Api } from "../src/api.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const KEY = "made-up-gateway-key-0000";
const GATEWAY = "https://gw.example.com/openai/deployments/{model}";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

function settings(ana: ReturnType<typeof bot>, secrets: Array<{ name: string }>) {
  const put = vi.fn(async () => ({ name: "API_KEY" }));
  const get = vi.fn(async (path: string) => (path.endsWith("/secrets") ? secrets : Promise.reject(new Error("not in this test"))));
  const onSave = vi.fn(async () => undefined);
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
  return { put, get, onSave };
}

describe("an OpenAI-compatible bot's API key (change 0041)", () => {
  it("saves the typed key in the bot's vault and only its name in the bot, sent as api-key", async () => {
    const ana = bot({ name: "Ana", brain: { kind: "openai", model: "gpt-4.1-mini" } });
    const { put, onSave } = settings(ana, []);
    await act(async () => undefined);
    const field = screen.getByLabelText("API key") as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.placeholder).toBe("sk-…");
    expect(screen.getByText(/write \{model\} in the address/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Base URL (optional)"), { target: { value: GATEWAY } });
    fireEvent.change(field, { target: { value: ` ${KEY} ` } });
    fireEvent.change(screen.getByLabelText("How to send the key"), { target: { value: "api-key" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(put).toHaveBeenCalledWith(`/api/v1/bots/${ana.id}/secrets/API_KEY`, { value: KEY });
    const patch = (onSave.mock.calls[0] as unknown as [{ brain: Record<string, unknown> }])[0];
    expect(patch.brain).toEqual({ kind: "openai", model: "gpt-4.1-mini", baseUrl: GATEWAY, apiKeySecret: "API_KEY", apiKeyHeader: "api-key" });
    expect(JSON.stringify(patch)).not.toContain(KEY);
    // The field empties and says a key is saved: the value never comes back.
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("•••• saved — paste a new one to change it");
  });

  it("keeps a saved key when the field is left empty, and the bot's own secret name", async () => {
    const ana = bot({ name: "Ana", brain: { kind: "anthropic", model: "claude-opus-5", apiKeySecret: "ANTHROPIC_KEY" } });
    const { put, onSave } = settings(ana, [{ name: "ANTHROPIC_KEY" }]);
    await act(async () => undefined);
    expect((screen.getByLabelText("API key") as HTMLInputElement).placeholder).toBe("•••• saved — paste a new one to change it");
    // Anthropic always sends x-api-key: no header choice.
    expect(screen.queryByLabelText("How to send the key")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(put).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brain: { kind: "anthropic", model: "claude-opus-5", apiKeySecret: "ANTHROPIC_KEY" } }));
  });

  it("a new bot hands its key apart from the bot", async () => {
    const onCreate = vi.fn(async () => undefined);
    render(<NewBotScreen bots={[]} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Brain"), { target: { value: "openai" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4.1-mini" } });
    fireEvent.change(screen.getByLabelText("Base URL (optional)"), { target: { value: GATEWAY } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: KEY } });
    fireEvent.change(screen.getByLabelText("How to send the key"), { target: { value: "api-key" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create bot" })));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: KEY,
        brain: { kind: "openai", model: "gpt-4.1-mini", baseUrl: GATEWAY, apiKeySecret: "API_KEY", apiKeyHeader: "api-key" },
      }),
    );
  });
});
