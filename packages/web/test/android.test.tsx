// specs/android-app — what the web app does inside the Android app: files go to the phone's Downloads,
// Settings shows the hub and changes it; in a browser, a plain download.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { VoiceSettings } from "../src/components/VoiceSettings.js";
import { androidApp, saveTextFile, setBackHandler } from "../src/native.js";
import type { Api } from "../src/api.js";
import { useLang } from "../src/i18n.js";

const bridge = () => ({ saveText: vi.fn(), changeHub: vi.fn(), hubUrl: vi.fn(() => "http://192.168.0.10:7420/"), version: vi.fn(() => "0.1.0+7") });

beforeEach(() => {
  act(() => useLang.getState().setLang("pt-BR"));
});
afterEach(() => {
  delete (window as unknown as { orbisAndroid?: unknown }).orbisAndroid;
  setBackHandler(null);
});

describe("inside the Android app", () => {
  it("saves files to the phone through the app, and downloads them in a browser", () => {
    expect(androidApp()).toBeNull();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    saveTextFile("time.txt", "oi");
    expect(click).toHaveBeenCalledTimes(1);

    const android = bridge();
    (window as unknown as { orbisAndroid: unknown }).orbisAndroid = android;
    saveTextFile("ana.orbis.yaml", "name: Ana", "text/yaml");
    expect(android.saveText).toHaveBeenCalledWith("ana.orbis.yaml", "text/yaml", "name: Ana");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shows the hub it is connected to in Settings and changes it", async () => {
    const android = bridge();
    (window as unknown as { orbisAndroid: unknown }).orbisAndroid = android;
    const api = { get: vi.fn(async () => ({ transcription: { configured: false, source: null } })) } as unknown as Api;
    render(<VoiceSettings api={api} />);
    await act(async () => undefined);
    expect(screen.getByTestId("android-card").textContent).toContain("Conectado ao Orbis em http://192.168.0.10:7420/ · versão 0.1.0+7 do app");
    fireEvent.click(screen.getByRole("button", { name: "Trocar servidor" }));
    expect(android.changeHub).toHaveBeenCalled();
  });

  it("hides the card in a browser and lets the app ask the page about Back", () => {
    const api = { get: vi.fn(async () => ({ transcription: { configured: false, source: null } })) } as unknown as Api;
    render(<VoiceSettings api={api} />);
    expect(screen.queryByTestId("android-card")).toBeNull();
    const back = vi.fn(() => true);
    setBackHandler(back);
    expect((window as unknown as { __orbisBack(): boolean }).__orbisBack()).toBe(true);
    setBackHandler(null);
    expect((window as unknown as { __orbisBack?: unknown }).__orbisBack).toBeUndefined();
  });
});
