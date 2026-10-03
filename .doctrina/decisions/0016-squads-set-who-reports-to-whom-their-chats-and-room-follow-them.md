# ADR 0016 — Squads set who reports to whom; their chats and room follow them

- **Status:** accepted
- **Scope:** squads, handoff, routines, bots, conversations
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "organizar os meus robôs ou agentes por squad… cada squad tem um representante… pode delegar a um gerente, ou todas as squads podem ser delegadas por um gerente… podem conversar entre si… as rotinas de cada um podem serem chamadas por outros agentes"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/squads/service.ts`, `packages/hub/src/collab/handoff.ts`, `packages/hub/src/routines/service.ts`, `packages/shared/src/handles.ts`
- **Landed:** 2026-10-03 — `packages/hub/src/squads/service.ts`, `packages/hub/src/routines/service.ts`

## Context

The team already has a hierarchy: each bot may report to a manager
(`reportsTo`, change 0014). Delegation (`team.handoff`) and report-back
follow it. The owner wants three more things:

- Bots grouped in named squads. Each squad has a representative, and each
  representative has a manager (possibly one manager for all squads).
- Squads that talk with each other.
- Routines that other bots can call.

## Decision

- **A squad is a table, membership a column.** `squads` holds the name, a
  unique handle, the representative, the manager and the squad's group.
  `bots.squad_id` holds membership, so a bot is in one squad at most.
- **The squads write the hierarchy.**
  - After every change to squads, each member reports to its squad's
    representative, and the representative to the manager.
  - A bot that leaves stops reporting along the squad's line. Bots in no
    squad keep their own manager.
  - The whole new set of lines is checked for loops before it is written. A
    change that would loop is undone.
  - A bot's settings no longer edit `reportsTo` while the bot is in a squad.
  - Delegation, report-back and each bot's context therefore follow the
    squads with no new mechanism.
- **Every squad has a representative.** When the representative leaves or
  is deleted, the first member by name takes over.
- **Chats follow the squads.**
  - Each squad gets a group from two members, led by its representative.
  - The hub keeps one room of every representative and manager.
  - The hub keeps the members of both in sync, within the group size limit.
    A group that refuses a change (for example, full because of members
    added by hand) stays as it is.
- **`@squad` is an alias, not a bot.** `resolveMentions` takes an alias map
  (squad handle → representative). Bot handles and roles come first, so a
  squad never takes a bot's name. Mentions and `team.handoff` use the map.
- **A routine call is a handoff.**
  - `routine.call` hands the routine's instruction, with the caller's note,
    to the routine's bot in the caller's conversation, through the same
    `delegate` function `team.handoff` uses.
  - The answer comes back the same way, the draft-only mode still applies,
    and the routine's run records who called it (`called_by`).
  - Only enabled routines, which were tested, can be called, and never the
    caller's own.

## Alternatives considered

1. Squads apart from `reportsTo`, with their own delegation tools.
   Rejected: two hierarchies that disagree, and every prompt explaining both.
2. A bot standing in for each squad (a "squad bot"). Rejected: an extra
   brain and extra runs for no work of its own; the representative is a
   real member.
3. Running a called routine in its owner's own conversation. Rejected: the
   caller would not hear back, and the user would follow the work in two
   places.

## Consequences

**Positive**

- Squads work with every brain at once: the hierarchy, the context and
  `team.handoff` already guide the bots.
- Squads and managers talk where the user can see them, in their chats and
  the room.

**Negative**

- A squad overrides the manager the user had set for its bots.
- A squad larger than the group size limit (`ORBIS_MAX_GROUP_SIZE`, 6 by
  default) has a chat with only its first members.
