# Change 0041-openai-compatible-gateways — openai-compatible gateways

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** runtime (confident; signals: secret) — opened anyway (--force)
- **Affects specs:** agent-runtimes, secrets, web-app
- **Documented surface:** n/a — documented in docs/brains.md, docs/secrets-and-usage.md and docs/cli.md with this change

## Why

The owner set a bot on the "OpenAI-compatible API" brain against their company's
gateway and it failed with "openai brain: secret <the key> is not set". The bot's
settings had only a field for the **name** of the vault secret holding the key,
so the key was pasted there: it worked nowhere, sat in plain text in the bot,
and the check repeated it on screen. The gateway also differs from OpenAI the
way Azure OpenAI does: the key goes in an `api-key` header (a Bearer JWT is the
alternative), the model is in the path (`…/openai/deployments/{model}/chat/completions`),
and its documented requests use `"stream": false`. The owner asked that Orbis
take only the address and the key from them, with no company address in the code.

## What

- Shared/hub: `Brain.apiKeyHeader` (`bearer` default, or `api-key`);
  `apiKeySecret` takes a secret's name only (schema pattern).
- openai brain: `{model}` in the base address is the model (`completionsUrl`);
  the key is sent per `apiKeyHeader` (`keyHeaders`); a JSON answer is read as a
  non-streamed completion (`jsonChunks`); a 4xx naming the stream is asked again
  with `"stream": false`; the check never echoes a value that is not a name.
- anthropic brain: the same no-echo check.
- Secrets: `moveMisplacedKeys()` at hub start moves a key found in
  `apiKeySecret` into the bot's vault as `API_KEY`, points the bot at it and
  masks it in run errors and timeline items.
- Web: an **API key** password field (bot settings and the new-bot screen) that
  saves to the bot's vault and shows "•••• saved"; **How to send the key** for
  `openai`; help on `{model}`. CLI: `--api-key-header`.
- Tests: `packages/hub/test/runtimes/openai.test.ts` (gateway fake, stream
  fallback, migration), `packages/web/test/api-key.test.tsx`; the settings test
  follows. Docs: `docs/brains.md`, `docs/secrets-and-usage.md`, `docs/cli.md`,
  CHANGELOG, the contract.

## Scope boundaries

- No gateway address, key or model list ships in the code, tests or docs: the
  user types the address; examples use `gw.example.com`.
- Prices stay in the user's `prices.json`; no gateway's price list is added to
  the shipped table.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
