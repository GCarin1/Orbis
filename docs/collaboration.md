# Bots working together

Bots collaborate in three ways: they share a **group conversation**, they
**hand a task** to another bot, and they **remember** facts for later runs —
their own, or the whole team's. The rules live in
[`specs/conversations`](../.doctrina/specs/conversations/spec.md),
[`specs/handoff`](../.doctrina/specs/handoff/spec.md) and
[`specs/memory`](../.doctrina/specs/memory/spec.md).

## Groups

A group holds 2 to 6 bots (`ORBIS_MAX_GROUP_SIZE`) and has a **lead**. Who
answers a message you post in a group:

| Your message | Who runs |
|--------------|----------|
| mentions members (`@ana check the logs`) | each mentioned member |
| mentions `@everyone` | every member |
| mentions nobody | the lead |

A mention of a bot outside the group starts nothing. When a bot's reply in a
group mentions another member, that member runs next with the reply as its
task — so `@bob` can ask `@ana` for help in the open.

```bash
orbis group create "Release" @ana @bob --lead @bob
orbis group chat Release "@ana are the smoke tests green?"
orbis group chat Release            # interactive
orbis group add Release @cara       # at most 6 members
orbis group remove Release @ana     # never below 2; the lead passes on
```

In the web app, **+ New group** in the sidebar picks the members and the lead;
typing `@` in the message box lists the members (and `@everyone`).

## Handoff

`team.handoff` is a tool every bot has (subject to its allowlist and policy):

```json
{ "to": "@bob", "task": "Check the staging logs for 500s", "context": "deploy 42 at 14:05", "returnResult": true }
```

- The sender gets an answer **at once** (`Handed off to @bob (handoff itm_…)`)
  and does not wait: its run goes on or ends.
- A **handoff card** appears in the conversation: `queued` → `running` →
  `done` or `failed` (for example when the receiver is deleted first).
- The receiver runs with the task and the context only — **not** the
  sender's conversation history — and its answer is threaded under the card.
- With `returnResult: true` the sender runs again with the receiver's answer
  as its task, so it can go on from there.
- A bot cannot hand a task to itself.

`orbis chat` and `orbis group chat` keep streaming until the runs a handoff or
a mention started have ended too.

### The depth limit

Each run started by a bot (a handoff, a mention, a returned result) is one
level deeper than the run that started it. A run deeper than
`ORBIS_MAX_HANDOFF_DEPTH` (default 4) is refused: the tool call fails with
`the chain of bot-to-bot steps reached its limit (4)` and the conversation shows a
`handoff.depth_exceeded` event. Two bots can therefore never ping-pong
forever.

## Memory

Each memory entry is a `preference`, a `role`, a `fact` or a `summary`, and
belongs to one bot or to the whole team.

- Bots save with `memory.save { text, kind?, scope?: "bot"|"team" }` and search
  with `memory.search { query, limit? }` (full-text; best matches first).
- After every successful run the bot keeps a `summary`: the task and the start
  of its reply (500 characters).
- Each run starts with the most relevant entries in its context (at most 8).
- A bot never sees another bot's own entries; team entries are shared.
- You can read and edit everything: `orbis memory list @ana`,
  `orbis memory add --team "Staging lives at qa.acme.test"`,
  `orbis memory edit mem_… "new text"`, `orbis memory rm mem_…`, or the REST
  routes below. Edits and deletes take effect in the next search.
