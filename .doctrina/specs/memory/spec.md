# Spec — memory

**Capability:** memory
**Status:** active
**Implementation:** verified
**Realizes:** SC1
**Depends on:** bots
**Last updated:** 2026-09-27
**Version:** 0.4.1

## Purpose

A bot's context grows with time: preferences, facts about its role and
summaries of past work. Memory is private per bot, with an optional team layer
shared by every bot. This capability stores memory entries, searches them and
assembles each run's context inside a fixed budget, pruning the oldest
conversation items first.

## Requirements (EARS)

### Ubiquitous

- The system shall store memory entries either for one bot or at team level, each with a kind (`preference`, `role`, `fact` or `summary`), text, source and timestamp.
- The system shall index memory text for full-text search with SQLite FTS5.
- The system shall assemble each run's context from: every `preference` and `role` entry of the bot, up to 8 other entries of the bot and of the team ranked by relevance to the task of the moment with at most 3 `summary` entries among them, and the most recent conversation items that fit within 30 items and 12,000 characters, dropping the oldest items first and cutting an item longer than 4,000 characters to its beginning and end.
- The system shall provide the tools `memory.save` and `memory.search`, which reach only the calling bot's own entries and team entries.
- The system shall fill the relevant entries of a context in rank order from a search three times wider than the 8 entries it keeps, so summaries over the limit of 3 leave their places to the next facts.

### Event-driven

- When a run triggered by a message, a handoff, a routine or the API finishes successfully, the system shall store a `summary` entry for the bot holding the task and the first 500 characters of the reply, unless the bot already has that exact summary, and keep the bot's newest 200 summaries.
- When the user edits or deletes a memory entry, the system shall update the search index in the same database transaction.

### Unwanted-behavior (must-not)

- The system shall not return one bot's own entries to another bot, through tools or through context assembly.
- The system shall not rank memory entries by words too common to tell them apart (Portuguese and English articles, prepositions and pronouns).
- The system shall not put another bot's run failures in a bot's conversation history.

## Acceptance criteria

1. [verified] `memory.save` stores an entry that `memory.search` finds by a word of its text, team entries are found by every bot, and edits and deletes are reflected in search at once — verified by `packages/hub/test/memory.test.ts`.
2. [verified] A bot's search never returns another bot's own entries — verified by `packages/hub/test/memory.test.ts`.
3. [verified] Context assembly keeps at most 30 items and 12,000 characters of conversation, drops the oldest first, and includes every preference entry — verified by `packages/hub/test/context.test.ts`.
4. [verified] A successful run stores a `summary` entry with the task and the start of the reply — verified by `packages/hub/test/memory.test.ts`.
5. [verified] A 13,000-character item is cut and the items before it stay; another bot's failure is left out of the history; answers to a mention or a report leave no summary and the same summary is kept once; "de" and "the" are not searched; at most 3 summaries reach the context next to a fact — verified by `packages/hub/test/chat-audit.test.ts`.
6. [verified] With ten summaries ranked above a fact, the context holds 3 summaries and the fact; accented Portuguese words such as "não", "está" and "você" are not searched — verified by `packages/hub/test/review.test.ts`.

## Maturity

**MVP (committed):**

- Entries per bot and team, FTS5 search, context budget and pruning, run summaries.

**Future (aspirational, not committed):**

- Vector search (embeddings) next to FTS5.
- Summaries written by the brain itself instead of a truncated reply.

## Out of scope for this spec

- Session resume inside CLI brains (see `specs/agent-runtimes`).
