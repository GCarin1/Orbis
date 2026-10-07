# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement event: When the updates of an MCP server a bot watches reach it, the system shall start a run of the bot's initiative (`mcp`) that hands them as untrusted data and asks the bot to tell the user what matters in one to three sentences or to answer `[silent]`, holding them through the quiet hours and while the bot works, and at most 12 times a day per bot.
append-requirement unwanted: The system shall not wake a bot with MCP updates while every bot's initiative is off.
append-criterion [verified] Updates sent in the quiet hours wait and reach the bot when they end; with every bot's initiative off they reach nobody, then or later — verified by `packages/hub/test/mcp-updates.test.ts`
```
