# Change 0028-review-of-the-audits — Review of the audits

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, review)
- **Affects specs:** conversations, agent-runtimes, memory, computer, web-app

## Why

The project owner asked for a review of everything changes 0021 to 0027
touched, mainly the chat and the bots. Re-reading the diff since 1371e0b found
defects those changes introduced or left in the code they touched.

## What

- Windows: `computer.shell` passed the command as an argument quoted by the C
  runtime's rules, so every `"` reached cmd.exe as `\"`; a command with
  quotes (`mkdir "Nova Pasta"`, `git commit -m "…"`) failed. It now goes
  verbatim, as Node's own shell option passes it.
- Windows: files Windows PowerShell writes are UTF-16; `computer.read_file`
  (cycle 3) refused them as binary. Byte-order marks are read now.
- A resumed CLI session got only what came after its last run ended: a
  colleague's message posted while that run worked was never seen.
- The summary cap of change 0022 dropped summaries from the 8 best matches but
  did not refill: a fact ranked ninth stayed out. The search is wider now.
- The stop words of change 0022 missed accented forms ("não", "está", "você").
- At an API brain's last step, a retried request repeated the "answer now" note.
- Try again (change 0022) re-ran a routine's draft-only test run outside its
  routine, where external tools would act; refused now, and the chat says why
  a retry did not work.
- The chat counted a bot starting to work as a "new message below", and a
  conversation reloaded during a run lost steps already shown (step writes
  are throttled since cycle 5).
- Tests: `packages/hub/test/review.test.ts`, `packages/web/test/review.test.tsx`; earlier expectations updated in
  `packages/hub/test/chat-audit.test.ts` and
  `packages/hub/test/audit-cycle3.test.ts`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- The rest of the diff was re-read and kept: the engine's clock and waiting
  count, chains and mentions, the bridge, the Codex fallback, Markdown, the
  stream heartbeat, routines and the MCP wire names.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
