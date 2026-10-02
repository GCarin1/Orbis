# Bots working together

Bots work as a **team**: each one can report to a manager, a manager
**delegates** to its reports and tells you when the work is done, bots bring
each other into a conversation by **mentioning** a handle or a role, they
share **group conversations**, and they **remember** facts for later runs —
their own, or the whole team's. The rules live in
[`specs/bots`](../.doctrina/specs/bots/spec.md),
[`specs/conversations`](../.doctrina/specs/conversations/spec.md),
[`specs/handoff`](../.doctrina/specs/handoff/spec.md) and
[`specs/memory`](../.doctrina/specs/memory/spec.md).

## A team with a hierarchy

Give each bot the bot it reports to (in the web app, **Reports to** in the
bot's settings; in the CLI, `--reports-to`):

```bash
orbis bots create --name "Chief" --role "Chief of Staff"
orbis bots create --name "Dana" --role "Designer" --reports-to @chief
orbis bots create --name "Quinn" --role "QA" --reports-to @chief
orbis bots edit @quinn --reports-to none     # back to the top of the team
```

Every bot's prompt names its manager, its reports and its colleagues with
their roles, and tells it how the team works. A bot cannot report to itself
or to a bot that already reports to it; when a manager is deleted, its reports
move up to the manager's own manager.

### Ask the manager, hear back when it is done

```bash
orbis chat @chief "Prepare the launch page: a hero banner and a QA pass on checkout"
```

1. **Chief** splits the request and hands each part to the report whose role
   fits (`team.handoff`), several at once, and answers you right away.
2. **Dana** and **Quinn** work in parallel. Their answers appear in Chief's
   conversation, under the handoff cards.
3. When **every** task Chief handed off in that turn has ended — done or
   failed — Chief runs once more with all the answers and **comes back to
   you on its own** with the outcome. You do not have to ask.

The desktop app raises a notification when a manager reports back
(`bot.report` event), and the web app marks the conversation as unread.

## Mentions: handles and roles

`@handle` names one bot; `@role` names every bot whose role is that role
(`@qa`, `@designer`, `@chief-of-staff` — the role written like a handle).

| Where | Who runs |
|-------|----------|
| you, in a bot's own conversation | that bot — it coordinates, and brings in whoever you mention |
| you, in a group, mentioning bots (`@ana`, `@qa`) | each mentioned bot, member of the group or not |
| you, in a group, `@everyone` | every member |
| you, in a group, no mention | the lead |
| a bot's reply mentioning one or two colleagues | each of them, once, in the same conversation |
| a bot's reply naming three or more bots | no one (it reads as a list; a `mention.list` event says so) |

So bots talk to each other without you relaying: a bot that writes "I asked
@designer for the banner" brings the designer into that conversation. A bot's
reply does not start again the bots it just handed work to, nor the bot that
handed it its task (that one gets the answer in its report), and a manager's
report to you starts no one. A bot woken by a mention answers but wakes no
one, and a bot that already answered the same message is not woken again — so
a bot that lists the team ("available now: @ana, @bob and @cara") does not set
them answering each other. Bots are told this, and `team.list_bots` gives
handles without `@` so a bot can name colleagues without waking them.

## Groups

A group holds 2 to 6 bots (`ORBIS_MAX_GROUP_SIZE`) and has a **lead**.

```bash
orbis group create "Release" @ana @bob --lead @bob
orbis group chat Release "@ana are the smoke tests green?"
orbis group chat Release            # interactive
orbis group add Release @cara       # at most 6 members
orbis group remove Release @ana     # never below 2; the lead passes on
```

In the web app, **+ New group** picks the members and the lead; typing `@` in
the message box lists the bots (and `@everyone` in a group).

## Handoff

`team.handoff` is a tool every bot has (subject to its allowlist and policy):

```json
{ "to": "@designer", "task": "Draft the hero banner", "context": "launch on Friday", "returnResult": true }
```

- `to` is a handle, or a role exactly one bot holds (a role several bots hold
  is refused, naming them).
- The sender gets an answer **at once** (`Handed off to @dana (handoff itm_…)`)
  and does not wait: its run goes on or ends.
- A **handoff card** appears in the conversation: `queued` → `running` →
  `done` or `failed` (for example when the receiver is deleted first).
- The receiver runs with the task and the context only — **not** the
  sender's conversation history — and its answer is threaded under the card.
- `returnResult` is true by default: once every handoff of the sender's run
  has ended, the sender runs once more (trigger `report`) with all the
  answers and failures. Set it to `false` for work it does not need to hear
  back about.
- A bot cannot hand a task to itself.

`orbis chat` and `orbis group chat` keep streaming until the runs a handoff, a
report or a mention started have ended too.

### The depth limit

Each run started by a bot (a handoff, a report back, a mention) is one level
deeper than the run that started it. A run deeper than
`ORBIS_MAX_HANDOFF_DEPTH` (default 6: a manager, its reports and their own
reports, with the reports back) is refused: the tool call fails with
`the chain of bot-to-bot steps reached its limit (6)` and the conversation
shows a `handoff.depth_exceeded` event. Bots can therefore never ping-pong
forever.

### The chain limit

Everything one message of yours sets off — every bot it runs, their
handoffs, mentions and reports — is one **chain**. A chain holds at most
`ORBIS_MAX_CHAIN_RUNS` runs (default 12): a handoff or a mention beyond that
is refused and the conversation shows a `chain.limit` event. A report back is
always allowed, so a manager always tells you how its delegation ended. See
[the bot behaviour audit](bot-behaviour-audit.md) for why.

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
