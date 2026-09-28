// Voice (specs/hub-api): the transcription service that turns recorded speech
// into text when the browser cannot (the desktop app, Firefox). Any
// OpenAI-compatible `/audio/transcriptions` endpoint works — OpenAI, Groq, or a
// local Whisper server — set in the settings screen, by environment, or taken
// from the OpenAI key alone.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { TranscriptionStatus, TranscriptionTestResult } from "@orbis/shared";
import type { HubConfig } from "../config.js";
import { badRequest, HttpError } from "../errors.js";
import type { SettingsRepo } from "../repos/settings.js";
import type { HubSecrets } from "../secrets/hub-secrets.js";

export const OPENAI_URL = "https://api.openai.com/v1";
export const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";
/** The upload limit of OpenAI's endpoint; a spoken message is far below it. */
export const AUDIO_LIMIT = 25 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 90_000;

const URL_KEY = "voice.transcribe_url";
const MODEL_KEY = "voice.transcribe_model";
const SECRET = "TRANSCRIBE_API_KEY";

interface Target {
  url: string;
  model: string;
  key: string | null;
  source: NonNullable<TranscriptionStatus["source"]>;
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

/** The file name the service reads the format from. */
export function audioFileName(contentType: string): string {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  return `speech.${EXTENSIONS[type] ?? "webm"}`;
}

/** One second of 16 kHz mono silence as a WAV file: the test clip. */
export function silentWav(seconds = 1, rate = 16_000): Buffer {
  const samples = seconds * rate;
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + data, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(data, 40);
  return wav;
}

const clip = (text: string, n = 300) => (text.length > n ? `${text.slice(0, n)}…` : text);

function checkUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("not a URL", { url: "an http or https address, e.g. https://api.openai.com/v1" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw badRequest("not an http address", { url: "http or https only" });
  return url.replace(/\/+$/, "");
}

export class VoiceService {
  constructor(
    private readonly config: HubConfig,
    private readonly settings: SettingsRepo,
    private readonly secrets: HubSecrets,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** The service in use: the settings screen's, else the environment's, else OpenAI's with the OpenAI key. */
  target(): Target | null {
    const savedUrl = this.settings.get(URL_KEY);
    const savedKey = this.secrets.get(SECRET);
    const model = this.settings.get(MODEL_KEY) ?? this.config.transcribeModel ?? DEFAULT_TRANSCRIBE_MODEL;
    if (savedUrl || savedKey) return { url: savedUrl ?? OPENAI_URL, model, key: savedKey, source: "settings" };
    if (this.config.transcribeUrl) return { url: this.config.transcribeUrl.replace(/\/+$/, ""), model, key: this.config.transcribeApiKey, source: "env" };
    if (this.config.openaiApiKey) return { url: OPENAI_URL, model, key: this.config.openaiApiKey, source: "openai" };
    return null;
  }

  status(): TranscriptionStatus {
    const target = this.target();
    return {
      configured: target !== null,
      source: target?.source ?? null,
      url: target?.url ?? null,
      model: target?.model ?? null,
      hasKey: Boolean(target?.key),
    };
  }

  /** Save what the settings screen sent: a value replaces, null or "" clears, absent keeps. */
  save(body: { url?: string | null; model?: string | null; apiKey?: string | null }): TranscriptionStatus {
    if (body.url !== undefined) {
      if (body.url) this.settings.set(URL_KEY, checkUrl(body.url.trim()));
      else this.settings.delete(URL_KEY);
    }
    if (body.model !== undefined) {
      if (body.model?.trim()) this.settings.set(MODEL_KEY, body.model.trim());
      else this.settings.delete(MODEL_KEY);
    }
    if (body.apiKey !== undefined) {
      if (body.apiKey) this.secrets.set(SECRET, body.apiKey);
      else this.secrets.delete(SECRET);
    }
    return this.status();
  }

  /** Send the audio to the service and return what was said. */
  async transcribe(audio: Buffer, contentType: string, lang?: string): Promise<string> {
    const target = this.target();
    if (!target) {
      throw new HttpError(503, "transcription_unavailable", "no transcription service is set up: add one in Settings → Voice, or set ORBIS_TRANSCRIBE_URL");
    }
    if (audio.length === 0) throw badRequest("no audio in the request body");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: contentType.split(";")[0]!.trim() || "audio/webm" }), audioFileName(contentType));
    form.append("model", target.model);
    if (lang && /^[a-z]{2}/i.test(lang)) form.append("language", lang.slice(0, 2).toLowerCase());
    form.append("response_format", "json");
    let res: Response;
    try {
      res = await this.fetchImpl(`${target.url}/audio/transcriptions`, {
        method: "POST",
        headers: target.key ? { authorization: `Bearer ${target.key}` } : {},
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new HttpError(
        502,
        "transcription_failed",
        `the transcription service at ${target.url} did not answer: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const body = await res.text();
    if (!res.ok) throw new HttpError(502, "transcription_failed", `the transcription service answered ${res.status}: ${clip(body)}`);
    try {
      const parsed = JSON.parse(body) as { text?: unknown };
      return String(parsed.text ?? "").trim();
    } catch {
      return body.trim();
    }
  }

  /** Send a second of silence: proves the address, the key and the model are right. */
  async test(): Promise<TranscriptionTestResult> {
    const started = Date.now();
    try {
      const text = await this.transcribe(silentWav(), "audio/wav", "en");
      return { ok: true, text, durationMs: Date.now() - started, error: null };
    } catch (err) {
      return { ok: false, text: "", durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const raw = (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body);
    app.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: AUDIO_LIMIT }, raw);
    app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: AUDIO_LIMIT }, raw);

    const Settings = Type.Object(
      {
        url: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
        model: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
        apiKey: Type.Optional(Type.Union([Type.String({ maxLength: 4000 }), Type.Null()])),
      },
      { additionalProperties: false },
    );
    const Query = Type.Object({ lang: Type.Optional(Type.String({ maxLength: 16 })) });

    app.get("/api/v1/voice", { schema: { tags: ["voice"] } }, async () => ({ transcription: this.status() }));
    app.put("/api/v1/voice/transcription", { schema: { tags: ["voice"], body: Settings } }, async (req) => ({ transcription: this.save(req.body) }));
    app.post("/api/v1/voice/test", { schema: { tags: ["voice"] } }, async () => this.test());
    app.post("/api/v1/voice/transcribe", { bodyLimit: AUDIO_LIMIT, schema: { tags: ["voice"], querystring: Query } }, async (req) => {
      const body = req.body;
      if (!Buffer.isBuffer(body)) throw badRequest("send the recording as the request body with an audio/* content type");
      return { text: await this.transcribe(body, String(req.headers["content-type"] ?? "audio/webm"), req.query.lang) };
    });
  }
}
