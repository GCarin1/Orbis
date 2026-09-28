# Tasks — Change 0014-team-hierarchy

- [x] Add `reportsTo`, the `report` trigger, the `bot.report` event and role-aware mention resolution to `@orbis/shared`.
- [x] Store the manager (migration 3) with its rules: no self, no loop, reports move up on delete, duplicates keep it.
- [x] Give every bot a team section in its prompt.
- [x] Batch handoffs per run and report back once, with a top-level message and a `bot.report` event.
- [x] Route mentions by handle or role in groups and in bot replies anywhere, with the exceptions that prevent double work.
- [x] Add `--reports-to` to the CLI and follow report runs in `orbis chat`.
- [x] Notify reports in the desktop app.
- [x] Cover it with hub, CLI and desktop tests and update the tests that pinned the old behaviour.
- [x] Update the contract, `.env.example`, docs and CHANGELOG.
