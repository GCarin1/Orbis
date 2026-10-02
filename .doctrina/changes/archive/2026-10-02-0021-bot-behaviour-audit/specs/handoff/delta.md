# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall limit the runs of one chain to 12, set by ORBIS_MAX_CHAIN_RUNS, and always start the report back to a delegating bot.
append-requirement ubiquitous: The system shall tell each bot that writing `@handle` or `@role` in a reply wakes that colleague, to do it only to ask one or two colleagues for something, and to write a colleague's name without `@` otherwise.
append-requirement unwanted: The system shall not accept a handoff, nor wake a mentioned bot, once its chain has used ORBIS_MAX_CHAIN_RUNS runs; it shall return an error result to the caller and post a `chain.limit` event instead.
append-criterion [verified] With ORBIS_MAX_CHAIN_RUNS at 3, a bot handing off to four reports gets two acknowledgments and two refusals, three runs exist and a `chain.limit` event is posted — verified by `packages/hub/test/bot-behaviour.test.ts`.
```
