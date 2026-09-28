// specs/web-app — voice and theme (change 0016-voice-and-theme): dictation into
// the composer with the browser's recognition, a recording sent to the hub's
// transcription service where the browser has none, replies read aloud, the
// voice settings, and the System/Light/Dark switch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { TimelineItem } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { Composer } from "../src/components/Composer.js";
import { ThemeChoice, ThemeSwitch } from "../src/components/ThemeSwitch.js";
import { Timeline } from "../src/components/Timeline.js";
import { VoiceSettings } from "../src/components/VoiceSettings.js";
import { useLang } from "../src/i18n.js";
import { useTheme } from "../src/theme.js";
import { speakable, useReadAloud, useVoice } from "../src/voice.js";
import { bot } from "./fixtures.js";

const spoken: Array<{ text: string; lang: string }> = [];

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  started = false;
  onresult: ((e: { results: unknown }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  /** The browser hears words: each entry is one result, final or not. */
  hear(...parts: Array<[string, boolean]>) {
    const results = parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ results: Object.assign(results, { length: results.length }) });
  }
}

class FakeRecorder {
  static last: FakeRecorder | null = null;
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  localStorage.clear();
  spoken.length = 0;
  act(() => {
    useLang.getState().setLang("en");
    useVoice.setState({ readAloud: false, transcription: null });
  });
  const synth = { speak: (u: { text: string; lang: string }) => spoken.push({ text: u.text, lang: u.lang }), cancel: vi.fn(), getVoices: () => [] };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      voice: unknown = null;
      constructor(public text: string) {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  FakeRecognition.last = null;
  FakeRecorder.last = null;
});

describe("the microphone", () => {
  it("writes what the browser hears after the text already typed, and stops on send", async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Chief" onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Hi", selectionStart: 2 } });

    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    const rec = FakeRecognition.last!;
    expect(rec.started).toBe(true);
    expect(rec.lang).toBe("en-US");
    expect(screen.getByTestId("voice-status").textContent).toMatch(/Listening/);
    act(() => rec.hear(["ship the launch", true], [" page today", false]));
    expect(box.value).toBe("Hi ship the launch page today");
    expect(screen.getByRole("button", { name: "Stop listening" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Hi ship the launch page today"));
    expect(screen.getByRole("button", { name: "Speak" })).toBeTruthy();
  });

  it("records and sends the audio to the hub where the browser cannot take dictation", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) }, configurable: true });
    const transcribe = vi.fn(async (_audio: Blob, _lang: string) => "revise o relatório");
    act(() => useLang.getState().setLang("pt-BR"));
    render(<Composer name="Chefe" transcribe={transcribe} onSend={async () => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Falar" }));
    await waitFor(() => expect(FakeRecorder.last?.state).toBe("recording"));
    expect(screen.getByTestId("voice-status").textContent).toMatch(/Gravando/);
    fireEvent.click(screen.getByRole("button", { name: "Parar de ouvir" }));
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("revise o relatório"));
    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), "pt-BR");
    expect(transcribe.mock.calls[0]![0].type).toBe("audio/webm");
    expect(track.stop).toHaveBeenCalled();
  });

  it("explains how to get voice when neither the browser nor the hub can transcribe", () => {
    render(<Composer name="Chief" onSend={async () => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(screen.getByTestId("voice-status").textContent).toMatch(/set up a transcription service.*Win\+H/);
  });
});

describe("reading aloud", () => {
  const chief = bot({ name: "Chief", role: "Chief of Staff" });
  const item = (id: string, author: TimelineItem["author"], text: string): TimelineItem => ({
    id,
    conversationId: "cnv_1",
    kind: "message",
    author,
    text,
    parentId: null,
    mentions: [],
    attachments: [],
    reactions: {},
    runId: null,
    createdAt: "2026-09-28T09:00:00.000Z",
    updatedAt: "2026-09-28T09:00:00.000Z",
  });

  it("reads a reply on demand, and new replies once the switch is on — not the history", () => {
    const history = [item("i1", { type: "user", id: null }, "hello"), item("i2", { type: "bot", id: chief.id }, "Hi! See **https://x.example** @chief")];
    render(<Timeline items={history} bots={{ [chief.id]: chief }} runs={{}} activeRuns={[]} ownBotId={chief.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(spoken).toEqual([{ text: "Hi! See chief", lang: "en-US" }]);
    spoken.length = 0;

    const { rerender } = renderHook(({ items, loaded }) => useReadAloud("cnv_1", items, loaded), { initialProps: { items: [] as TimelineItem[], loaded: false } });
    rerender({ items: history, loaded: true });
    expect(spoken).toEqual([]);

    render(<Composer name="Chief" onSend={async () => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Read replies aloud" }));
    expect(useVoice.getState().readAloud).toBe(true);
    expect(localStorage.getItem("orbis.readAloud")).toBe("1");
    rerender({ items: history, loaded: true });
    expect(spoken).toEqual([]);

    rerender({ items: [...history, item("i3", { type: "bot", id: chief.id }, "All done.")], loaded: true });
    expect(spoken).toEqual([{ text: "All done.", lang: "en-US" }]);
    rerender({ items: [...history, item("i3", { type: "bot", id: chief.id }, "All done."), item("i4", { type: "user", id: null }, "thanks")], loaded: true });
    expect(spoken).toHaveLength(1);
    expect(speakable("```\ncode\n``` done _now_")).toBe("done now");
  });
});

describe("voice settings", () => {
  it("saves the transcription service, never shows the key back, and tests it", async () => {
    const calls: Array<[string, string, unknown]> = [];
    let status = { configured: false, source: null, url: null, model: null, hasKey: false } as Record<string, unknown>;
    const api = {
      get: vi.fn(async (path: string) => {
        calls.push(["GET", path, undefined]);
        return { transcription: status };
      }),
      put: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push(["PUT", path, body]);
        status = { configured: true, source: "settings", url: body.url, model: body.model ?? "whisper-1", hasKey: Boolean(body.apiKey) };
        return { transcription: status };
      }),
      post: vi.fn(async () => ({ ok: true, text: "", durationMs: 420, error: null })),
    } as unknown as Api;
    render(<VoiceSettings api={api} />);
    await waitFor(() => expect(screen.getByTestId("transcription-status").textContent).toContain("No service set up"));

    fireEvent.change(screen.getByLabelText("Address (base URL)"), { target: { value: "https://api.groq.com/openai/v1" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "whisper-large-v3-turbo" } });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: "gsk-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("transcription-status").textContent).toContain("Set up here"));
    expect(calls.at(-1)).toEqual(["PUT", "/api/v1/voice/transcription", { url: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo", apiKey: "gsk-123" }]);
    expect((screen.getByLabelText(/API key/) as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("transcription-status").textContent).toContain("key saved");

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(screen.getByTestId("transcription-test").textContent).toBe("✓ The service answered in 420 ms."));
  });
});

describe("theme", () => {
  it("cycles System → Light → Dark, applies it to the page and remembers it", () => {
    act(() => useTheme.getState().setTheme("system"));
    render(
      <>
        <ThemeSwitch />
        <ThemeChoice />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Theme: System" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Theme: Light" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("orbis.theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: /Dark/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /System/ }));
    expect(useTheme.getState().theme).toBe("system");
    expect(screen.getByRole("button", { name: "Theme: System" })).toBeTruthy();
  });
});
