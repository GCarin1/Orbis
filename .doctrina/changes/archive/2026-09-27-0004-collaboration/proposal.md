# Change 0004-collaboration — collaboration

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** conversations, handoff, memory, tool-gateway, cli, web-app

## Why

Collaboration: group conversations of 2 to 6 bots routed by @mention, @everyone or the lead bot, bot-to-bot mentions and asynchronous team.handoff with handoff cards, returned results and a depth limit, and memory entries per bot and team with memory.save, memory.search and run summaries

product.md delivery step 4 and success criteria SC4 (bots collaborate) and
SC1 (memory that grows with time).

## What

- Groups: `POST /conversations`, `PATCH|DELETE /conversations/:id`,
  `POST|DELETE /conversations/:id/members`; the group router (mentions,
  `@everyone`, lead); bot replies that mention members start their runs;
  the chain depth limit with a `handoff.depth_exceeded` event.
- `team.handoff` tool: handoff card (`queued`, `running`, `done`,
  `failed`), the receiver's run with the task and context only (no
  foreign history), the threaded reply, `returnResult`, failure when the
  receiver is deleted first.
- Memory: REST routes for bot and team entries, `memory.save` and
  `memory.search` tools, a `summary` entry after each successful run.
- CLI: `orbis group create|list|chat`, `orbis memory list|add|rm`.
- Web: groups in the sidebar, group creation, group timeline, handoff cards,
  `@` autocomplete in the composer.
- Docs and CHANGELOG.

## Scope boundaries

- `/skill` autocomplete arrives with skills (web-app criterion 4 closes there).
- No task board and no scheduled group summaries (future).
- No vector search for memory (future).

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] conversations criteria 2–3, handoff criteria 1–4 and memory criteria 1, 2 and 4 cite passing tests (`doctrina coverage`).
- [x] Two bots handing work to each other stop at the depth limit with an event.

## Open questions

- None.
