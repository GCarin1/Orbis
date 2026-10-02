# Tasks — Change 0021-bot-behaviour-audit

- [x] Reproduce the group loop in a test and find its cause (mentions woke every named bot to depth 6).
- [x] Chain id on runs (migration 6), mention rules, `ORBIS_MAX_CHAIN_RUNS` budget, `mention.list` and `chain.limit` events.
- [x] Bot context and `team.list_bots` without `@`.
- [x] Windows `.cmd` shims: native programs and npm's npx.cmd / npm.cmd; MCP stderr summary.
- [x] Browser fallback to Chrome or Edge; OS and shell in the bot's context.
- [x] Timeout counts working time; last-step answer for API brains; identical-call guard; clearer brain errors; idle state after restart.
- [x] `skills.create` tool.
- [x] Regression tests `bot-behaviour.test.ts` and `runtimes/windows-shims.test.ts`; full suites green.
- [x] Audit document, collaboration docs, `.env.example`, CHANGELOG, contract.
