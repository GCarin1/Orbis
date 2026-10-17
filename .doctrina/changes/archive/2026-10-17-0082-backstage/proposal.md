# Change 0082-backstage — backstage

- **Status:** applied
- **Applied:** 2026-10-17
- **Date:** 2026-10-17
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** conversations, web-app

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

The owner found group chats "always very polluted". When the lead hands work out, the chat shows its plan, every
handoff card and every colleague's long answer before the conclusion. They asked for two things:
- chats that read like people talking, with short replies;
- the bots' talk among themselves kept out of the chat, ending in a verdict.

They chose:
- one line while the team works;
- short replies and the backstage as the default for new conversations;
- a switch per conversation, plus the default in Settings.

## What

- **Hub**
  - Migration 18 adds `conversations.reply_style` and `conversations.backstage`; null follows the default.
    Existing conversations are set to detailed and in the chat.
  - It also adds `items.backstage`.
  - `collab/backstage.ts` (`ConversationStyle`):
    - the default, kept in settings;
    - `GET` and `PUT /api/v1/conversations/defaults`, and `PUT /api/v1/conversations/:id/style`;
    - the short-reply instruction for the bot that answers the user, never for a handed-off task;
    - the backstage rule: handoff cards, the receivers' runs, and the lead's run while it waits for its report.
  - The engine marks replies and failures as backstage; the timeline keeps them out of the list of chats.
- **Cloud:** `supabase/migrations/0006_conversation_style.sql`.
- **Web**
  - The timeline hides backstage items, shows the "talking with" line, and shows "See backstage" with its
    dialog.
  - Phone notifications, read-aloud and the unread dot skip backstage work.
  - The ⋮ menus of a bot and of a group switch replies and backstage; Settings → Conversations holds the
    default.
- **Docs:** `docs/collaboration.md`, the contract and the CHANGELOG.

## Scope boundaries

Bots woken by a mention in another bot's reply still talk in the chat: only handed-off work goes backstage.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/backstage.test.ts`, `packages/web/test/backstage.test.tsx`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
