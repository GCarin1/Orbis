# Spec — memory

**Capability:** memory
**Status:** active
**Implementation:** verified
**Realizes:** SC1
**Depends on:** bots
**Last updated:** 2026-09-27
**Version:** 0.3.0

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
- The system shall assemble each run's context from: every `preference` and `role` entry of the bot, up to 8 other entries of the bot and of the team ranked by relevance to the task of the moment, and the most recent conversation items that fit within 30 items and 12,000 characters, dropping the oldest items first.
- The system shall provide the tools `memory.save` and `memory.search`, which reach only the calling bot's own entries and team entries.

### Event-driven

- When a run finishes successfully, the system shall store a `summary` entry for the bot holding the task and the first 500 characters of the reply.
- When the user edits or deletes a memory entry, the system shall update the search index in the same database transaction.

### Unwanted-behavior (must-not)

- The system shall not return one bot's own entries to another bot, through tools or through context assembly.

## Acceptance criteria

1. [verified] `memory.save` stores an entry that `memory.search` finds by a word of its text, team entries are found by every bot, and edits and deletes are reflected in search at once — verified by `packages/hub/test/memory.test.ts`.
2. [verified] A bot's search never returns another bot's own entries — verified by `packages/hub/test/memory.test.ts`.
3. [verified] Context assembly keeps at most 30 items and 12,000 characters of conversation, drops the oldest first, and includes every preference entry — verified by `packages/hub/test/context.test.ts`.
4. [verified] A successful run stores a `summary` entry with the task and the start of the reply — verified by `packages/hub/test/memory.test.ts`.

## Maturity

**MVP (committed):**

- Entries per bot and team, FTS5 search, context budget and pruning, run summaries.

**Future (aspirational, not committed):**

- Vector search (embeddings) next to FTS5.
- Summaries written by the brain itself instead of a truncated reply.

## Out of scope for this spec

- Session resume inside CLI brains (see `specs/agent-runtimes`).
