# Change 0040-group-membership-and-clearing-a-conversation — group membership and clearing a conversation

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature, fix)
- **Affects specs:** conversations, web-app
- **Documented surface:** n/a — documented in docs/collaboration.md with this change
## Why

The owner found the web app had no way to delete a group, clear a chat or remove a
member, and that a deleted bot stayed in its groups. They asked for groups that
behave like a chat app's: "<bot> joined the group" with its face when a bot joins,
the conversation's history open to it, and no new messages for a bot that left.

The hub already had the routes to delete a group and add or remove a member; the
web app showed none. A deleted bot's membership rows went with it (a cascade), but
nothing told the web app, so the group kept showing it, and the lead went
missing.

## What

- Hub (`services/conversations.ts`): `member.joined` and `member.left` events (with
  the bot's name, handle, color and shape, so a deleted bot's face still shows),
  posted at creation, on add, on remove and on deletion; a bot that left and is
  mentioned is not run (`member.absent`); `botDeleted` (a delete hook) takes a bot
  out of its groups and deletes an emptied group; `clear` with
  `DELETE /conversations/:id/items` (items, brain sessions, run summaries; refused
  while a run works); a group shrinks to one bot. Repo helpers for each.
- Web: the events with the bot's face; the group's header with **+ Add…**, × on
  each chip, clear and delete; clear in a direct conversation's header;
  `conversation.cleared` empties the timeline; failures show under the header.
- Tests: `packages/hub/test/group-membership.test.ts`, `tests/e2e/groups.test.ts`;
  the conversations test follows the new minimum. Docs: `docs/collaboration.md`,
  CHANGELOG, the contract.

## Scope boundaries

- A bot that was never in a group can still be called in by a mention, as the
  spec says; only a bot that left is kept out.
- Memories a bot saved on purpose survive a clear; only the automatic run
  summaries of that conversation go.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
