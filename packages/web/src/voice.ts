// Voice in the web app (specs/web-app): dictation with the browser's speech
// recognition, a recording sent to the hub's transcription service where the
// browser has none (the desktop app, Firefox), and replies read aloud with the
// system's voices.
import { plainText } from "./components/Markdown.js";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import type { TimelineItem, TranscriptionStatus } from "@orbis/shared";
import { useLang, type Lang } from "./i18n.js";

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

/** The Orbis desktop app: Electron ships the recognition API without the online service behind it. */
export function isDesktopShell(): boolean {
  return Boolean((window as unknown as { orbisDesktop?: unknown }).orbisDesktop) || /\bElectron\//.test(navigator.userAgent);
}

export function dictationCtor(): RecognitionCtor | null {
  if (isDesktopShell()) return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export const speechLang = (lang: Lang) => (lang === "pt-BR" ? "pt-BR" : "en-US");

/** Text as it should sound: no code blocks, links, markup or @ signs. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>`~|]/g, "")
    .replace(/(^|\s)@([a-z0-9-]+)/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read a text aloud, interrupting whatever was being read. */
export function speak(text: string, lang: Lang): boolean {
  if (!canSpeak()) return false;
  const words = speakable(text);
  if (!words) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(words);
  utterance.lang = speechLang(lang);
  const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

const READ_KEY = "orbis.readAloud";

function initialReadAloud(): boolean {
  try {
    return localStorage.getItem(READ_KEY) === "1";
  } catch {
    return false;
  }
}

interface VoiceState {
  /** Read each new reply of the open conversation aloud. */
  readAloud: boolean;
  setReadAloud(on: boolean): void;
  /** The hub's transcription service, once loaded. */
  transcription: TranscriptionStatus | null;
  setTranscription(status: TranscriptionStatus): void;
}

export const useVoice = create<VoiceState>((set) => ({
  readAloud: initialReadAloud(),
  setReadAloud(on) {
    try {
      localStorage.setItem(READ_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    if (!on) stopSpeaking();
    set({ readAloud: on });
  },
  transcription: null,
  setTranscription(status) {
    set({ transcription: status });
  },
}));

export type DictationState = "idle" | "listening" | "recording" | "transcribing";
export type DictationHint = "micBlocked" | "noSpeech" | "unavailable" | "setup" | "failed" | null;

/**
 * The microphone of the composer. With the browser's recognition the words
 * arrive while the user speaks; otherwise the recording goes to `transcribe`
 * when the user stops. `onText` receives everything said since the start.
 */
export function useDictation({
  lang,
  transcribe,
  onText,
}: {
  lang: Lang;
  /** The hub's transcription service, or null when it has none. */
  transcribe: ((audio: Blob, lang: string) => Promise<string>) | null;
  onText(text: string, final: boolean): void;
}) {
  const [state, setState] = useState<DictationState>("idle");
  const [hint, setHint] = useState<DictationHint>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  /** Set when the user sends mid-recording: the recording is thrown away. */
  const discard = useRef(false);
  const latest = useRef({ transcribe, onText });
  latest.current = { transcribe, onText };

  useEffect(
    () => () => {
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  const record = async () => {
    const send = latest.current.transcribe;
    if (!send || !canRecord()) {
      setHint("setup");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setHint("micBlocked");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    discard.current = false;
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      recorder.current = null;
      if (discard.current) {
        setState("idle");
        return;
      }
      const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (audio.size === 0) {
        setState("idle");
        setHint("noSpeech");
        return;
      }
      setState("transcribing");
      send(audio, speechLang(lang))
        .then((text) => {
          if (text) latest.current.onText(text, true);
          else setHint("noSpeech");
        })
        .catch((err: unknown) => {
          setHint("failed");
          setDetail(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setState("idle"));
    };
    rec.start();
    setState("recording");
  };

  const listen = (Ctor: RecognitionCtor) => {
    const rec = new Ctor();
    recognition.current = rec;
    rec.lang = speechLang(lang);
    rec.continuous = true;
    rec.interimResults = true;
    let fellBack = false;
    rec.onresult = (e) => {
      let text = "";
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i]![0]!.transcript;
        if (!e.results[i]!.isFinal) final = false;
      }
      latest.current.onText(text.trim(), final);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "audio-capture") setHint("micBlocked");
      else if (e.error === "no-speech") setHint("noSpeech");
      else if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") {
        // The browser has the API but not the service: record for the hub instead.
        if (latest.current.transcribe && canRecord()) fellBack = true;
        else setHint("unavailable");
      }
    };
    rec.onend = () => {
      recognition.current = null;
      setState("idle");
      if (fellBack) void record();
    };
    rec.start();
    setState("listening");
  };

  const toggle = () => {
    setHint(null);
    setDetail(null);
    if (state === "listening") {
      recognition.current?.stop();
      return;
    }
    if (state === "recording") {
      recorder.current?.stop();
      return;
    }
    if (state === "transcribing") return;
    const Ctor = dictationCtor();
    if (Ctor) listen(Ctor);
    else void record();
  };

  /** Stop at once and drop what was not written yet (the message is being sent). */
  const cancel = () => {
    if (recognition.current) {
      recognition.current.onresult = null;
      recognition.current.abort();
    }
    if (recorder.current?.state === "recording") {
      discard.current = true;
      recorder.current.stop();
    }
  };

  return { state, hint, detail, toggle, cancel };
}

/**
 * Read aloud each bot message that arrives in the open conversation while the
 * user wants it — not the history shown on opening one, nor the last message
 * when the switch is turned on.
 */
export function useReadAloud(conversationId: string | undefined, items: TimelineItem[], loaded: boolean): void {
  const lang = useLang((s) => s.lang);
  const readAloud = useVoice((s) => s.readAloud);
  const last = items.at(-1);
  const heard = useRef<{ conversationId?: string; last?: string; loaded: boolean }>({ loaded: false });
  useEffect(() => {
    const before = heard.current;
    heard.current = { conversationId, last: last?.id, loaded };
    if (!readAloud || !before.loaded || before.conversationId !== conversationId || before.last === last?.id) return;
    if (last?.kind === "message" && last.author.type === "bot") speak(plainText(last.text), lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, last?.id, loaded, readAloud]);
}
