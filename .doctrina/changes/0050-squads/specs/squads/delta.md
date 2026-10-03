# Spec Delta — capability: squads

**Operation:** ADDED
**Target spec on apply:** `.doctrina/specs/squads/spec.md`

---

# Spec — squads

**Capability:** squads
**Status:** active
**Implementation:** verified — `packages/hub/src/squads/service.ts` (squads, members, representative, manager, who reports to whom, the squads' groups and room, `@squad` aliases, the squads' context, `team.list_squads`, routes), `routine.call` in `packages/hub/src/routines/service.ts`, the web app's Squads screen (`SquadsScreen.tsx`), the sidebar's squad filter and the squad in a bot's settings
**Realizes:** SC12
**Depends on:** bots, conversations, handoff, routines
**Last updated:** 2026-10-03
**Version:** 0.1.0

## Purpose

Squads organize a team of bots. A squad has a name and a handle, and each
bot belongs to at most one squad. One member, its representative, speaks
for the squad: the other members report to it. The representative reports to
the squad's manager, a bot outside the squad, and one manager may take every
squad. Delegation and report-back (`specs/handoff`) then follow the squads.
Each squad gets its own group chat. The representatives and managers share a
room. `@squad` reaches a squad's representative in a message or a handoff, and
any bot can call another bot's routines.

## Requirements (EARS)

### Ubiquitous

- The system shall keep squads: a name, a handle, a description, a color, a representative, a manager and a group conversation.
  - The handle comes from the name. It is never another squad's handle, nor a bot's handle or role.
  - The members are the bots whose squad it is. A bot is in at most one squad.
- The system shall keep each squad's representative among its members, giving it to the first member by name when there is none or it left.
- The system shall make each member report to its squad's representative, and the representative to the squad's manager.
- The system shall make a bot that leaves a squad stop reporting to the bot it reported to as a member or as the representative.
- The system shall keep each squad's group to its members from two of them (up to ORBIS_MAX_GROUP_SIZE of them), led by the representative and named after the squad.
- The system shall keep a room: a group of every representative and manager, from two of them, led by the manager when there is one.
- The system shall resolve `@handle` of a squad, where no bot's handle or role matches it, to the squad's representative: in a message's mentions, in a bot reply's mentions and in `team.handoff`.
- The system shall tell each bot its squad, its representative and manager, its squadmates, the squads it manages, the other squads with their handle and representative, and how to reach them; `team.list_squads` lists them and `team.list_bots` gives each bot's squad.
- The web app shall provide a Squads screen, 🛡 in the sidebar.
  - An org chart shows each manager with the squads it takes, with their representatives and sizes.
  - Each squad has a card with its handle and description and these controls: rename, description and color; manager; representative (☆); remove a member; add a bot (one in another squad says where it is); the squad's chat; delete.
  - The screen also offers the bots in no squad, one manager for every squad, the room, and a new squad with its bots.
- The web app shall filter the sidebar by squad (all, a squad's bots and chat, the bots in no squad), remembered in the browser, and mark each bot and squad chat with its squad's color; a bot's settings offer its squad.

### Event-driven

- When the user creates a squad with bots, the system shall move them into it from any other squad.
- When the user sets one manager for every squad, the system shall give it to each squad it is not a member of.
- When a squad changes, the system shall tell every client (`squads.updated`) and each bot whose squad or manager changed (`bot.updated`).
- When a bot is deleted, the system shall take it out of its squad and of the squads it manages, and set the team again without it.
- When a squad is deleted, the system shall leave its bots in no squad and its chat as a plain group.

### Unwanted-behavior (must-not)

- The system shall not make a squad's member its manager, a non-member its representative, nor a squad's manager its member.
- The system shall not keep a change that would make a bot report to itself; the change is undone and the reason named.
- The system shall not let a bot's settings change who it reports to while it is in a squad: the squad decides.

## Acceptance criteria

1. [verified] A squad:
   - holds its bots under a name and a handle, with the first member as representative and the manager it reports to;
   - a new representative makes the others report to it;
   - leaving clears the bot's line; joining another squad moves the bot;
   - one manager takes every squad;
   - a renamed squad gets a new handle, and a deleted one lets its bots go.
   Verified by `packages/hub/test/squads.test.ts`.
2. [verified] A manager inside the squad, a representative outside it, a loop of managers and a squad's manager joining it are refused. A squad's handle avoids a bot's handle. Verified by `packages/hub/test/squads.test.ts`.
3. [verified] Groups:
   - a squad gets its group from two members, renamed and led as the squad is;
   - the room holds every representative and manager;
   - a member who leaves leaves the group.
   Verified by `packages/hub/test/squads.test.ts`.
4. [verified] A deleted representative is replaced by the first member left, and a deleted manager is forgotten — verified by `packages/hub/test/squads.test.ts`.
5. [verified] `@data` in the room wakes Data's representative, and a handoff to `@growth` reaches Growth's. A bot's context names its squad, the others and its role. `team.list_squads` lists the squads, and `team.list_bots` gives each bot's squad. Verified by `packages/hub/test/squads.test.ts`.
6. [verified] The screen:
   - creates a squad with its bots;
   - shows the org chart;
   - picks a squad's representative and manager, removes and adds bots, puts a bot in no squad into one, sets one manager for all, and opens the squad's chat and the room;
   - the sidebar filters by squad, remembers it, and marks bots with their squad's color;
   - a bot's settings put it in a squad and stop editing who it reports to.
   Verified by `packages/web/test/squads.test.tsx`.
7. [verified] In a real browser, the user creates two squads with their bots, picks a representative, sets one manager for both, sees the org chart, filters the sidebar, opens the squad's chat and the room, and `@data` there wakes Data's representative — verified by `tests/e2e/squads.test.ts`.
8. [verified] At 390 px, the Squads screen and a new squad's form scroll nothing sideways — verified by `tests/e2e/phone-layout.test.ts`.

## Maturity

**MVP (committed):**

- Squads with a representative and a manager, the hierarchy they set, their chats and room, `@squad`, `team.list_squads`, `routine.call`; the Squads screen and the sidebar filter (change 0050).

**Future (aspirational, not committed):**

- Squads inside squads (tribes).
- A squad's own routines and budget.

## Out of scope for this spec

- Delegation and report-back themselves (see `specs/handoff`), groups (see `specs/conversations`), routines (see `specs/routines`).
