# Change 0019-chatgpt-through-codex — ChatGPT through Codex

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes, web-app

## Why

The project owner has a paid ChatGPT plan, no API key and no ChatGPT app on
their machine, and asked whether the bots can use that subscription, and to
set it up if so. They can: a ChatGPT plan includes Codex, and the Codex CLI
signs in with the ChatGPT account. Orbis already had a `codex` brain, but
installing and signing in meant using a terminal.

## What

- Hub: `brains/codex-account.ts` and the `/api/v1/runtimes/codex/` routes.
- Shared: `CodexAccount`, `CliJob`.
- Web: `ChatGptCard.tsx` at the top of Settings → Brains; the `codex` brain's
  labels.
- Tests: hub `runtimes/codex-account`, web `chatgpt`, e2e `chatgpt`.
- Docs: `docs/brains.md`, `docs/api.md`, READMEs, CHANGELOG, contract
  hub-surface.

## Scope boundaries

- The chatgpt.com website is not automated: it is not an interface for
  programs and OpenAI's terms do not allow it.
- Sign-in for the other subscription CLIs (Claude Code, Gemini CLI, Cursor)
  stays in their own terminals.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`), including the new hub, web and end-to-end tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).
- [x] The real Codex CLI 0.158.0 was installed here and its `login status`, `login --device-auth` and `login` output checked against the parsers; a real ChatGPT sign-in needs the owner's account and was not done.

## Open questions

- None.
