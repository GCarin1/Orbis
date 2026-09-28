// specs/hub-api — voice: the transcription service set in the settings screen
// (or by environment, or the OpenAI key alone), recorded audio forwarded to it
// as a multipart upload, the key kept encrypted and never returned
// (change 0016-voice-and-theme).
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { audioFileName, silentWav } from "../src/voice/service.js";
import { testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

interface Upload {
  path: string;
  auth: string | undefined;
  model: string;
  language: string | null;
  fileName: string;
  fileType: string;
  bytes: number;
}

/** An OpenAI-compatible transcription endpoint that answers with a fixed text. */
async function fakeTranscriber(reply: { status?: number; text?: string } = {}): Promise<{ url: string; uploads: Upload[] }> {
  const uploads: Upload[] = [];
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": String(req.headers["content-type"]) } }).formData();
    const file = form.get("file") as File;
    uploads.push({
      path: req.url ?? "",
      auth: req.headers.authorization,
      model: String(form.get("model")),
      language: form.get("language") as string | null,
      fileName: file.name,
      fileType: file.type,
      bytes: file.size,
    });
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(reply.status && reply.status >= 400 ? { error: { message: "Incorrect API key provided" } } : { text: reply.text ?? " olá, equipe " }),
    );
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`, uploads };
}

const upload = (hub: TestHub, audio: Buffer, contentType: string, query = "") =>
  hub.hub.app.inject({
    method: "POST",
    url: `/api/v1/voice/transcribe${query}`,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": contentType },
    payload: audio,
  });

describe("voice transcription", () => {
  it("says when no service is set up, then forwards a recording to the one saved in settings", async () => {
    t = await testHub();
    expect((await t.api("GET", "/api/v1/voice")).body).toEqual({
      transcription: { configured: false, source: null, url: null, model: null, hasKey: false },
    });
    const refused = await upload(t, Buffer.from("webm-bytes"), "audio/webm");
    expect(refused.statusCode).toBe(503);
    expect(JSON.parse(refused.body).error.code).toBe("transcription_unavailable");

    const fake = await fakeTranscriber();
    const saved = await t.api("PUT", "/api/v1/voice/transcription", { url: `${fake.url}/`, model: "whisper-large-v3", apiKey: "sk-voice-123" });
    expect(saved.status).toBe(200);
    expect(saved.body.transcription).toEqual({ configured: true, source: "settings", url: fake.url, model: "whisper-large-v3", hasKey: true });
    expect(JSON.stringify(saved.body)).not.toContain("sk-voice-123");

    const res = await upload(t, Buffer.from("webm-bytes"), "audio/webm;codecs=opus", "?lang=pt-BR");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ text: "olá, equipe" });
    expect(fake.uploads).toEqual([
      {
        path: "/v1/audio/transcriptions",
        auth: "Bearer sk-voice-123",
        model: "whisper-large-v3",
        language: "pt",
        fileName: "speech.webm",
        fileType: "audio/webm",
        bytes: 10,
      },
    ]);

    // The key is stored encrypted: its value is nowhere in the database file.
    for (const file of readdirSync(t.dataDir).filter((f) => f.startsWith("orbis.db"))) {
      expect(readFileSync(path.join(t.dataDir, file)).includes(Buffer.from("sk-voice-123"))).toBe(false);
    }

    // Clearing the settings falls back to nothing configured.
    const cleared = await t.api("PUT", "/api/v1/voice/transcription", { url: null, model: null, apiKey: null });
    expect(cleared.body.transcription.configured).toBe(false);
  });

  it("uses the environment's service, else OpenAI with the OpenAI key, and reports a failing service", async () => {
    const fake = await fakeTranscriber({ status: 401 });
    t = await testHub({ env: { ORBIS_TRANSCRIBE_URL: fake.url } });
    expect((await t.api("GET", "/api/v1/voice")).body.transcription).toMatchObject({
      configured: true,
      source: "env",
      url: fake.url,
      model: "whisper-1",
      hasKey: false,
    });
    const test = await t.api("POST", "/api/v1/voice/test");
    expect(test.body).toMatchObject({ ok: false, text: "" });
    expect(test.body.error).toContain("answered 401");
    expect(fake.uploads[0]).toMatchObject({ fileName: "speech.wav", fileType: "audio/wav", auth: undefined, language: "en" });
    expect(fake.uploads[0]!.bytes).toBe(silentWav().length);
    await t.cleanup();

    t = await testHub({ env: { OPENAI_API_KEY: "sk-openai" } });
    expect((await t.api("GET", "/api/v1/voice")).body.transcription).toEqual({
      configured: true,
      source: "openai",
      url: "https://api.openai.com/v1",
      model: "whisper-1",
      hasKey: true,
    });
    expect((await t.api("PUT", "/api/v1/voice/transcription", { url: "ftp://x" })).status).toBe(400);
  });

  it("names the file after the recording's format", () => {
    expect(audioFileName("audio/ogg;codecs=opus")).toBe("speech.ogg");
    expect(audioFileName("audio/mp4")).toBe("speech.mp4");
    expect(audioFileName("application/octet-stream")).toBe("speech.webm");
    expect(silentWav().subarray(0, 4).toString()).toBe("RIFF");
  });
});
