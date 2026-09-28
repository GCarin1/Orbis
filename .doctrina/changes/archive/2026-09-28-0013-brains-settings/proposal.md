# Change 0013-brains-settings — brains-settings

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: support)
- **Affects specs:** agent-runtimes, web-app, cli

## Why

The project owner ran Orbis and had no way to tell whether their bots were
really answering through Claude: nothing in the app said which brain a bot uses or
proved that a model answered, and the only settings were per bot. They also
asked to use Cursor, LM Studio and Ollama. Ollama and LM Studio already worked,
but only hidden behind the generic OpenAI-compatible brain with a hand-typed
address. On Windows, where they run it, a CLI installed with `npm i -g` is a
`.cmd` file that Node.js refuses to start directly.

## What

- New brain kinds in `@orbis/shared`: `cursor` (a CLI brain), `ollama` and
  `lmstudio` (local brains), plus the `RuntimeHealth`, `LocalModelServer`
  and `BrainTestResult` shapes and the test question.
- Hub: `brains/cursor.ts` (the Cursor CLI adapter: stream-json mapping, chat
  resume, MCP wiring through `.cursor/mcp.json` and `Mcp(orbis:*)` in
  `.cursor/cli.json`, restored after each run); `brains/openai.ts` becomes a
  factory for `openai`, `ollama` and `lmstudio`, and retries once without
  tools when a local model rejects them; `brains/probe.ts` (the brain test);
  `brains/health.ts` (Cursor under either executable name, local servers and
  their models); `brains/process.ts` (Windows `.cmd` shims run their Node.js
  script); config `ORBIS_OLLAMA_URL` and `ORBIS_LMSTUDIO_URL`; routes
  `GET /api/v1/runtimes/local` and `POST /api/v1/runtimes/test` in
  `api/runtimes-routes.ts`.
- CLI: `orbis runtimes check` shows the local servers too; new
  `orbis runtimes test <kind>|@bot`.
- Web: the ⚙ Settings screen (brains on this machine with install hints and
  a Test button, local servers with their models, each bot's brain with Test
  and Configure), Cursor, Ollama and LM Studio in the new-bot dialog and bot
  settings with model suggestions, and the open bot's brain and model in the
  conversation header.
- Contracts `hub-surface` (routes, variables) and `cli-harnesses` (cursor,
  ollama/lmstudio, Windows shims, the brain test); `.env.example`; docs
  `brains.md`, `api.md`, `cli.md`; both READMEs; CHANGELOG.
- Specs agent-runtimes, web-app and cli (deltas in this change).

## Scope boundaries

- No change to how Claude Code, Codex or Gemini CLI runs are driven, apart
  from the Windows shim handling shared by every CLI brain.
- Cursor's own tools are not routed through Orbis approvals (Cursor has no
  permission-prompt hook); Orbis never passes `--force`, so they keep
  Cursor's rules, and the bot's Orbis tools keep the Orbis policy.
- The brain test is not recorded as a run and does not count toward usage or
  spend caps.

## Verification

- [x] Automated checks pass (`doctrina verify`), including the new hub, CLI, web and end-to-end browser tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).

## Open questions

- None.
