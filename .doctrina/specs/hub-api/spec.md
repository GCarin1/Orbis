# Spec — hub-api

**Capability:** hub-api
**Status:** active
**Implementation:** verified
**Realizes:** SC7
**Depends on:** bots, conversations
**Last updated:** 2026-09-27
**Version:** 0.5.0

## Purpose

The hub is the one server every client talks to. It serves a REST API, a
WebSocket event stream, the MCP endpoint, an OpenAI-compatible chat endpoint
(so any OpenAI client can talk to a bot) and the web app itself, all on one
port, behind one bearer token, bound to localhost by default. The exact
routes and shapes are owned by `contracts/hub-surface`.

## Requirements (EARS)

### Ubiquitous

- The system shall serve the REST API under `/api/v1`, the WebSocket stream at `/api/v1/stream`, the MCP endpoint at `/mcp`, the OpenAI-compatible endpoints `/v1/chat/completions` and `/v1/models`, the webhook receiver under `/hooks`, and the web app's static files at `/`, all on one port (ORBIS_PORT, default 7420).
- The system shall require a bearer token on every REST, stream and OpenAI-compatible request, the token read from ORBIS_TOKEN or generated at first start into the data directory file `token`.
- The system shall bind to 127.0.0.1 unless ORBIS_HOST names another address.
- The system shall validate every request body against its schema and answer 400 naming each failing field.
- The system shall publish an OpenAPI 3.1 document of the REST API at `/api/v1/openapi.json`.
- The system shall keep hub-wide settings changed from the app in its database, and hub-wide secrets (a transcription key) encrypted with the vault's key, reporting whether a secret is set and never its value.

### Event-driven

- When a `/v1/chat/completions` request names the model `orbis:<handle>`, the system shall post the last user message to that bot's direct conversation, run the bot and answer in the OpenAI chat completion shape, streaming server-sent events when `stream` is true.
- When a `/v1/models` request arrives, the system shall list one model `orbis:<handle>` per visible bot.
- When a WebSocket client sends a subscribe message listing conversation ids, the system shall deliver the events of those conversations and every `bot.state` and `approval.requested` event; with no list it shall deliver every event.
- When a recording arrives at `/api/v1/voice/transcribe`, the system shall send it to the transcription service in use — the one saved in the settings screen, else ORBIS_TRANSCRIBE_URL, else OpenAI's with OPENAI_API_KEY — as an OpenAI-compatible `/audio/transcriptions` upload with the model and the spoken language, and answer the text.

### Unwanted-behavior (must-not)

- The system shall not answer a request without a valid token with anything other than 401, except `/health`, `/hooks/*` (which carry their own signatures) and the static web app files.
- The system shall not accept a recording when no transcription service is set up (it answers 503 `transcription_unavailable`), nor pass off a failed transcription as text (it answers 502 `transcription_failed` with the service's status).
- The system shall not fail with a server error when a `/v1/chat/completions` message starts no run (a `/skill` the bot is not offered); it shall answer 400 `no_run`.

## Acceptance criteria

1. [verified] A request without a token answers 401, `/health` answers 200 without one, and `/api/v1/openapi.json` lists the bot routes — verified by `packages/hub/test/api.test.ts`.
2. [verified] A malformed bot body answers 400 naming the failing field — verified by `packages/hub/test/api.test.ts`.
3. [verified] `/v1/chat/completions` with `orbis:<handle>` answers the bot's reply in the OpenAI shape, and with `stream: true` as server-sent chunks ending in `[DONE]` — verified by `packages/hub/test/openai-compat.test.ts`.
4. [verified] A stream client subscribed to one conversation receives that conversation's items and not another's — verified by `packages/hub/test/stream.test.ts`.
5. [verified] Without a service the transcription answers 503; the service saved in settings receives the recording as a multipart upload with the file named after its format, the model, the language and the key, and the text comes back; the key is never returned nor stored in clear; the environment's service and the OpenAI key are used when nothing is saved, and the test reports a failing service — verified by `packages/hub/test/voice.test.ts`.
6. [verified] A completion asking for a skill the bot is not offered answers 400 with code `no_run` — verified by `packages/hub/test/audit-cycle4.test.ts`.

## Maturity

**MVP (committed):**

- One port, one token, REST, stream, MCP, OpenAI-compatible endpoint, OpenAPI document.

**Future (aspirational, not committed):**

- Multiple users with OIDC/SSO login and SCIM provisioning.
- Audit log export and OpenTelemetry traces.

## Out of scope for this spec

- What each route does beyond transport (see the capability that owns it).
