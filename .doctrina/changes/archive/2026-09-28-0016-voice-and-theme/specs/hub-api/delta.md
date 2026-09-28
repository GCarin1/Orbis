# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall keep hub-wide settings changed from the app in its database, and hub-wide secrets (a transcription key) encrypted with the vault's key, reporting whether a secret is set and never its value.
append-requirement event: When a recording arrives at `/api/v1/voice/transcribe`, the system shall send it to the transcription service in use — the one saved in the settings screen, else ORBIS_TRANSCRIBE_URL, else OpenAI's with OPENAI_API_KEY — as an OpenAI-compatible `/audio/transcriptions` upload with the model and the spoken language, and answer the text.
append-requirement unwanted: If no transcription service is set up, the system shall answer 503 `transcription_unavailable`, and if the service fails, 502 `transcription_failed` with its status.
append-criterion [verified] Without a service the transcription answers 503; the service saved in settings receives the recording as a multipart upload with the file named after its format, the model, the language and the key, and the text comes back; the key is never returned nor stored in clear; the environment's service and the OpenAI key are used when nothing is saved, and the test reports a failing service — verified by `packages/hub/test/voice.test.ts`.
```
