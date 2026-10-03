// specs/android-app — what the web app does inside the Android app: files go to the phone's Downloads, the
// phone tab shows the hub, its notifications and keeping it connected; on the computer it pairs the phone
// with a code; notifications for what happens off screen; the phone's dictation and voice; shared text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Bot, Conversation, StreamEvent, TimelineItem } from "@orbis/shared";
import { PhoneSettings } from "../src/components/PhoneSettings.js";
import { Composer } from "../src/components/Composer.js";
import { androidApp, saveTextFile, setBackHandler } from "../src/native.js";
import { notifyPhone, phoneNote } from "../src/phone.js";
import { AndroidRecognition, canSpeak, dictationCtor, speak, stopSpeaking } from "../src/voice.js";
import type { Api } from "../src/api.js";
import { translate, useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const bridge = <E extends Record<string, unknown>>(extra: E = {} as E) => ({
  saveText: vi.fn(),
  changeHub: vi.fn(),
  hubUrl: vi.fn(() => "http://192.168.0.10:7420/"),
  version: vi.fn(() => "0.1.0+7"),
  ...extra,
});
const install = (b: object) => ((window as unknown as { orbisAndroid: unknown }).orbisAndroid = b);
const ts = "2026-10-03T10:00:00.000Z";

beforeEach(() => {
  act(() => useLang.getState().setLang("pt-BR"));
});
afterEach(() => {
  delete (window as unknown as { orbisAndroid?: unknown }).orbisAndroid;
  setBackHandler(null);
  vi.restoreAllMocks();
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
    install(android);
    saveTextFile("ana.orbis.yaml", "name: Ana", "text/yaml");
    expect(android.saveText).toHaveBeenCalledWith("ana.orbis.yaml", "text/yaml", "name: Ana");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shows the hub, the notifications and keeping it connected in the phone tab", () => {
    const android = bridge({
      notify: vi.fn(),
      notificationsAllowed: vi.fn(() => false),
      requestNotifications: vi.fn(),
      keepConnected: vi.fn(() => false),
      setKeepConnected: vi.fn(),
      openBatterySettings: vi.fn(),
    });
    install(android);
    render(<PhoneSettings api={{} as Api} />);
    expect(screen.getByTestId("android-card").textContent).toContain("Conectado ao Orbis em http://192.168.0.10:7420/ · versão 0.1.0+7 do app");
    fireEvent.click(screen.getByRole("button", { name: "Permitir notificações" }));
    expect(android.requestNotifications).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Manter conectado com o app fechado/ }));
    expect(android.setKeepConnected).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Ajustes de bateria" }));
    expect(android.openBatterySettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Trocar servidor" }));
    expect(android.changeHub).toHaveBeenCalled();
    expect(screen.queryByTestId("pairing-card")).toBeNull();
  });

  it("asks an older app for an update instead of offering what it cannot do", () => {
    install(bridge());
    render(<PhoneSettings api={{} as Api} />);
    expect(screen.getByText(/gere o APK de novo/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Permitir notificações" })).toBeNull();
  });

  it("lets the app ask the page about Back", () => {
    const back = vi.fn(() => true);
    setBackHandler(back);
    expect((window as unknown as { __orbisBack(): boolean }).__orbisBack()).toBe(true);
    setBackHandler(null);
    expect((window as unknown as { __orbisBack?: unknown }).__orbisBack).toBeUndefined();
  });
});

describe("pairing the phone, on the computer", () => {
  it("makes a code, says how long it works and the addresses, and warns when the hub only listens here", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const post = vi.fn(async () => ({ code: "483219", expiresAt, listening: false, addresses: ["http://192.168.0.10:7420/"] }));
    render(<PhoneSettings api={{ post } as unknown as Api} />);
    expect(screen.queryByTestId("android-card")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Gerar código" })));
    expect(post).toHaveBeenCalledWith("/api/v1/pairing");
    expect(screen.getByTestId("pairing-code").textContent).toBe("483 219");
    expect(screen.getByText("vale uma vez, por mais 5:00")).toBeTruthy();
    expect(screen.getByText("http://192.168.0.10:7420/")).toBeTruthy();
    expect(screen.getByText(/escutando só neste computador/)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000 + 1000);
    });
    expect(screen.getByRole("button", { name: "Gerar outro código" })).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("notifications for the phone", () => {
  const ana = bot({ name: "Ana" });
  const bots: Record<string, Bot> = { [ana.id]: ana };
  const group = (muted: boolean): Conversation => ({
    id: "cnv_g",
    kind: "group",
    title: "Time",
    members: [ana.id],
    leadBotId: ana.id,
    description: "",
    photo: null,
    muted,
    createdAt: ts,
    lastItemAt: null,
  });
  const item = (over: Partial<TimelineItem>): TimelineItem => ({
    id: "itm_1",
    conversationId: "cnv_g",
    kind: "message",
    author: { type: "bot", id: ana.id },
    text: "**Pronto**: o relatório está em https://example.com/r",
    parentId: null,
    mentions: [],
    attachments: [],
    reactions: {},
    runId: null,
    createdAt: ts,
    updatedAt: ts,
    ...over,
  });
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("pt-BR", key, vars);
  const message = (over: Partial<TimelineItem> = {}): StreamEvent => ({ type: "timeline.item", ts, data: { conversationId: "cnv_g", item: item(over) } });

  it("says who replied, asked or finished, one per conversation, and keeps a muted group's messages quiet", () => {
    const ctx = { bots, conversations: { cnv_g: group(false) } };
    expect(phoneNote(message(), ctx, t)).toEqual({
      tag: "conv:cnv_g",
      title: "Ana · Time",
      body: "Pronto: o relatório está em https://example.com/r",
      conversationId: "cnv_g",
    });
    expect(phoneNote(message({ author: { type: "user", id: null } }), ctx, t)).toBeNull();
    expect(
      phoneNote(
        {
          type: "approval.requested",
          ts,
          data: { approval: { id: "apr_1", botId: ana.id, conversationId: "cnv_g", tool: "computer.shell", reason: "limpar a pasta", status: "pending" } },
        } as unknown as StreamEvent,
        ctx,
        t,
      ),
    ).toEqual({ tag: "approval:apr_1", title: "Ana pede para usar computer.shell", body: "limpar a pasta", conversationId: "cnv_g" });
    const secret = message({
      kind: "card",
      card: { type: "secret-request", state: "pending", data: { name: "GITHUB_TOKEN", reason: "abrir o PR", botId: ana.id } },
    });
    expect(phoneNote(secret, ctx, t)).toMatchObject({ tag: "secret:itm_1", title: "Ana pede o segredo GITHUB_TOKEN", body: "abrir o PR" });
    const report: StreamEvent = { type: "bot.report", ts, data: { botId: ana.id, conversationId: "cnv_g", itemId: "itm_9", text: "Tudo feito." } };
    expect(phoneNote(report, ctx, t)).toMatchObject({ tag: "conv:cnv_g", title: "Ana terminou", body: "Tudo feito." });

    const muted = { bots, conversations: { cnv_g: group(true) } };
    expect(phoneNote(message(), muted, t)).toBeNull();
    expect(phoneNote(report, muted, t)).toBeNull();
    expect(phoneNote(secret, muted, t)).not.toBeNull(); // a bot is waiting on the user
  });

  it("hands them to the app only while the app is off screen", () => {
    const notify = vi.fn();
    install(bridge({ notify }));
    const ctx = { bots, conversations: { cnv_g: group(false) } };
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    notifyPhone(message(), ctx);
    expect(notify).not.toHaveBeenCalled();
    visibility.mockReturnValue("hidden");
    notifyPhone(message(), ctx);
    expect(notify).toHaveBeenCalledWith("conv:cnv_g", "Ana · Time", expect.stringContaining("Pronto"), "cnv_g");
  });
});

describe("the phone's dictation and voice", () => {
  it("uses the phone's recognizer and voice when the app has them", () => {
    expect(dictationCtor()).not.toBe(AndroidRecognition);
    const android = bridge({ dictate: vi.fn(), speak: vi.fn(), stopSpeaking: vi.fn() });
    install(android);
    expect(dictationCtor()).toBe(AndroidRecognition);
    const rec = new AndroidRecognition();
    rec.lang = "pt-BR";
    const heard: string[] = [];
    rec.onresult = (e) => heard.push(e.results[0]![0]!.transcript);
    const ended = vi.fn();
    rec.onend = ended;
    rec.start();
    expect(android.dictate).toHaveBeenCalledWith("pt-BR");
    (window as unknown as { __orbisDictation(r: object): void }).__orbisDictation({ text: "olá equipe" });
    expect(heard).toEqual(["olá equipe"]);
    expect(ended).toHaveBeenCalledTimes(1);

    const failed = new AndroidRecognition();
    const errors: string[] = [];
    failed.onerror = (e) => errors.push(e.error);
    failed.start();
    (window as unknown as { __orbisDictation(r: object): void }).__orbisDictation({ error: "no-speech" });
    expect(errors).toEqual(["no-speech"]);

    expect(canSpeak()).toBe(true);
    expect(speak("**Oi** @ana, veja https://example.com", "pt-BR")).toBe(true);
    expect(android.speak).toHaveBeenCalledWith("Oi ana, veja", "pt-BR");
    stopSpeaking();
    expect(android.stopSpeaking).toHaveBeenCalled();
  });
});

describe("text shared into the app", () => {
  it("goes after what is already typed in the message box", async () => {
    const done = vi.fn();
    const { rerender } = render(<Composer name="Ana" prefill={null} onPrefilled={done} onSend={async () => undefined} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Olha isto:" } });
    rerender(<Composer name="Ana" prefill="https://example.com/artigo" onPrefilled={done} onSend={async () => undefined} />);
    await act(async () => undefined);
    expect(box.value).toBe("Olha isto:\nhttps://example.com/artigo");
    expect(done).toHaveBeenCalledTimes(1);
  });
});
