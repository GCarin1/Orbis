# Spec — secrets

**Capability:** secrets
**Status:** active
**Implementation:** verified — AES-256-GCM vault and gateway resolution (`packages/hub/src/secrets/`), redaction in the engine, the timeline and approvals
**Realizes:** SC9
**Depends on:** bots, tool-gateway
**Last updated:** 2026-09-27
**Version:** 0.3.0

## Purpose

Bots need credentials (API keys, passwords) without ever seeing them. This
capability keeps one encrypted vault per bot, asks the user for a secret
through a masked form outside the transcript, and injects the value only at
the moment a tool executes, redacting it from everything that comes back.

## Requirements (EARS)

### Ubiquitous

- The system shall encrypt every secret value with AES-256-GCM under a master key read from ORBIS_MASTER_KEY or, when it is unset, generated once into the data directory file `master.key` with file mode 0600.
- The system shall scope every secret to one bot and name it with `[A-Z][A-Z0-9_]{0,63}`.
- The system shall let tool inputs reference a secret as `{{secret:NAME}}` and replace the placeholder with the value only inside the tool gateway at execution time.
- The system shall replace every occurrence of a secret value in tool results, run events, timeline items and log lines with `••••` before storing or returning them.
- The system shall authenticate each encrypted value together with its bot id and name, so a value copied to another bot or name does not decrypt.
- The system shall keep one Bearer token per chat API, encrypted with the hub's secrets, list each chat API that `chat-http` bots use with its token's status and its bots, and replace an API's token on request; it shall never return the token itself.

### Event-driven

- When a bot calls `secret.request` with a name and a reason, the system shall post a secret-request card with a masked input, set the bot state to `waiting` and pause the run until the user submits or declines.
- When the user submits the form, the system shall store the value encrypted, mark the card `fulfilled` without the value, and resume the run with a result that names the placeholder to use.
- When the user declines the request, the system shall mark the card `declined` and resume the run with a result saying the secret is unavailable.

### Unwanted-behavior (must-not)

- The system shall not place a secret value in any brain input, timeline item, API response, run event or log line.
- The system shall not resolve a placeholder against another bot's vault.
- The system shall not resolve a placeholder in the input of a tool that only posts inside Orbis (drafts, conversation posts, memory, handoffs); only `computer.shell`, `computer.write_file`, `browser.open`, `browser.type` and `http.fetch` receive values.
- The system shall not keep a value with no token, nor a token for an address that is not http(s), and shall not leave a shared token unmasked in what a run stores or shows.

## Acceptance criteria

1. [verified] A stored secret decrypts to its value, the generated key file has mode 0600, and the ciphertext in the database does not contain the value — verified by `packages/hub/test/secrets.test.ts`.
2. [verified] The secret-request flow stores the value and resumes the run, and neither the timeline nor any API response contains the value — verified by `packages/hub/test/secrets.test.ts`.
3. [verified] A shell command using `{{secret:NAME}}` receives the value, and its echoed output returns to the brain with `••••` in place of the value — verified by `packages/hub/test/secrets.test.ts`.
4. [verified] A placeholder naming another bot's secret is not resolved — verified by `packages/hub/test/secrets.test.ts`.
5. [verified] Saving a token for an API returns each API with its bots and token status and never the token; a value with no token or a non-http address is refused; the token is masked in a run's stored reply — verified by `packages/hub/test/runtimes/chat-http.test.ts`.

## Maturity

**MVP (committed):**

- Encrypted per-bot vault, masked request cards, placeholder injection, redaction.

**Future (aspirational, not committed):**

- Hardware security key confirmation through the desktop app.
- OAuth connector tokens held by the hub.

## Out of scope for this spec

- Brain API keys set through the environment (see `specs/agent-runtimes`).
