# Spec — hub-api

**Capability:** hub-api
**Status:** active
**Implementation:** planned — REST, stream and auth land with the walking skeleton; the OpenAI-compatible endpoint lands in the brains change
**Realizes:** SC7
**Depends on:** bots, conversations
**Last updated:** 2026-09-27
**Version:** 0.1.0

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

### Event-driven

- When a `/v1/chat/completions` request names the model `orbis:<handle>`, the system shall post the last user message to that bot's direct conversation, run the bot and answer in the OpenAI chat completion shape, streaming server-sent events when `stream` is true.
- When a `/v1/models` request arrives, the system shall list one model `orbis:<handle>` per visible bot.
- When a WebSocket client sends a subscribe message listing conversation ids, the system shall deliver the events of those conversations and every `bot.state` and `approval.requested` event; with no list it shall deliver every event.

### Unwanted-behavior (must-not)

- The system shall not answer a request without a valid token with anything other than 401, except `/health`, `/hooks/*` (which carry their own signatures) and the static web app files.

## Acceptance criteria

1. [unverified] A request without a token answers 401, `/health` answers 200 without one, and `/api/v1/openapi.json` lists the bot routes — verified by `packages/hub/test/api.test.ts`.
2. [unverified] A malformed bot body answers 400 naming the failing field — verified by `packages/hub/test/api.test.ts`.
3. [unverified] `/v1/chat/completions` with `orbis:<handle>` answers the bot's reply in the OpenAI shape, and with `stream: true` as server-sent chunks ending in `[DONE]` — verified by `packages/hub/test/openai-compat.test.ts`.
4. [unverified] A stream client subscribed to one conversation receives that conversation's items and not another's — verified by `packages/hub/test/stream.test.ts`.

## Maturity

**MVP (committed):**

- One port, one token, REST, stream, MCP, OpenAI-compatible endpoint, OpenAPI document.

**Future (aspirational, not committed):**

- Multiple users with OIDC/SSO login and SCIM provisioning.
- Audit log export and OpenTelemetry traces.

## Out of scope for this spec

- What each route does beyond transport (see the capability that owns it).
