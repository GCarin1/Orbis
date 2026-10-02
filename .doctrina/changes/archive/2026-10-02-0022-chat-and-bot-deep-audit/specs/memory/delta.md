# Spec Delta — capability: memory

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/memory/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 3: The system shall assemble each run's context from: every `preference` and `role` entry of the bot, up to 8 other entries of the bot and of the team ranked by relevance to the task of the moment with at most 3 `summary` entries among them, and the most recent conversation items that fit within 30 items and 12,000 characters, dropping the oldest items first and cutting an item longer than 4,000 characters to its beginning and end.
replace-requirement event 1: When a run triggered by a message, a handoff, a routine or the API finishes successfully, the system shall store a `summary` entry for the bot holding the task and the first 500 characters of the reply, unless the bot already has that exact summary, and keep the bot's newest 200 summaries.
append-requirement unwanted: The system shall not rank memory entries by words too common to tell them apart (Portuguese and English articles, prepositions and pronouns).
append-requirement unwanted: The system shall not put another bot's run failures in a bot's conversation history.
append-criterion [verified] A 13,000-character item is cut and the items before it stay; another bot's failure is left out of the history; answers to a mention or a report leave no summary and the same summary is kept once; "de" and "the" are not searched; at most 3 summaries reach the context next to a fact — verified by `packages/hub/test/chat-audit.test.ts`.
```
