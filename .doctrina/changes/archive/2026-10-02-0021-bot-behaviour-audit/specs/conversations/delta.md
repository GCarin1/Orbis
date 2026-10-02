# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
replace-requirement event 5: When a bot's reply in a direct or group conversation mentions one or two other bots of the team by `@handle` or by role, the system shall start one run, triggered as `mention`, for each of them in that conversation, in the chain of the run that replied, subject to the chain limits and the exceptions of `specs/handoff`.
append-requirement ubiquitous: The system shall give every run a chain id: a user message starts one chain that every bot it runs shares, and the handoffs, reports back and mentions that follow from them carry it on.
append-requirement unwanted: The system shall not wake any bot for a reply that names more than two bots of the team, which reads as a list of the team; it shall post a `mention.list` event instead.
append-requirement unwanted: The system shall not start a run for a bot that a `mention` run's reply names, nor wake by mention a bot that already ran in the same chain.
append-criterion [verified] A lead's reply listing three colleagues wakes none and posts `mention.list`; a reply calling one colleague wakes it once as `mention`, and its answer naming the lead back wakes no one; `@everyone` runs each member once — verified by `packages/hub/test/bot-behaviour.test.ts`.
append-criterion [verified] Two bots one user message mentions, whose replies mention each other, run once each, in one chain — verified by `packages/hub/test/handoff.test.ts`.
```
