# Change 0042-group-info-like-a-chat-app — group info like a chat app

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** conversations, web-app, desktop-app, agent-runtimes
- **Documented surface:** n/a — documented in docs/collaboration.md with this change

## Why

The owner found no way to add a bot to a group: the header's "+ Add…" showed
only while at least one bot was outside the group, squeezed among the member
chips, and a group holding six bots (the default limit) refused more without the
screen saying so. They asked for groups laid out like WhatsApp or Telegram: a group
photo, a ⋮ menu with every option, and a group info opened from the photo or the
name — a flyout on the right on the desktop.

## What

- Hub: `Conversation.description`, `photo` (a small `data:` image) and `muted`
  (migration 9); `PATCH /conversations/:id` takes them and posts `group.renamed`,
  `group.described`, `group.photo` and `group.lead` events; the description is in
  the group's bots' context and the info events stay out of their history;
  `GET /conversations/:id/search` (ignoring case and accents),
  `GET /conversations/:id/links` and `GET /conversations/limits`.
- Web: `GroupHeader` (photo, name, members or who works, search, ⋮ menu),
  `GroupMenu`, `GroupInfoPanel` (photo, name, description, add/search/mute/export,
  links, members with message/make lead/remove, notifications, clear/delete; a
  search view and a links view) as a resizable flyout or a phone's full screen,
  `AddMembersDialog`; the timeline says the info changes and marks a found
  message; the sidebar marks muted groups; the new-group dialog follows the
  hub's limit.
- Desktop: a muted conversation's reports raise no notification.
- Tests: `packages/hub/test/group-info.test.ts`, `packages/web/test/group-info.test.tsx`,
  the desktop notifications test, `tests/e2e/groups.test.ts` rewritten for the
  menu and the info. Docs: `docs/collaboration.md`, CHANGELOG, the contract.

## Scope boundaries

- The group limit stays `ORBIS_MAX_GROUP_SIZE` (6 by default, product intent
  SC4); the screen now names it and the docs say how to raise it.
- WhatsApp's disappearing messages and chat themes have no meaning for bots and
  are left out; a direct conversation keeps its own header.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
