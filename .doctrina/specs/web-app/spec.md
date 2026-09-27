# Spec — web-app

**Capability:** web-app
**Status:** active
**Implementation:** planned — in progress: roster, groups, direct and group chat, approval, draft, handoff, routine and secret-request cards, thread replies, the approvals inbox, @ and / autocomplete, the skills, usage and routines screens, the computer side panel and full screen with takeover, languages and the end-to-end paths are verified; the bot settings screen lands with templates
**Realizes:** SC7, SC4, SC5
**Depends on:** hub-api
**Last updated:** 2026-09-27
**Version:** 0.7.0

## Purpose

The web app is the main way people work with their bots, and it is the same
code the desktop app shows. It is organised around bots, not around
conversations: the sidebar is the roster, each bot's state is always visible,
and the conversation is one timeline with messages, events, cards and each
run's steps.

## Requirements (EARS)

### Ubiquitous

- The web app shall show a roster sidebar with each bot's initials avatar ringed by its state color and icon, name, role, last message and its time, pinned bots first and bots grouped by role.
- The web app shall show a conversation's timeline with messages, events and the approval, draft, handoff, secret-request and routine cards, thread replies and reactions, and each run's steps as a collapsible list.
- The web app shall provide a composer with autocomplete for `@handle` mentions and `/skill` invocations.
- The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, the approvals inbox, and the computer view as a side panel and full screen.
- The web app shall show every text in pt-BR or English, following the browser language, with a manual switch that is remembered.
- The web app shall ship a web app manifest and a service worker so it can be installed on desktop and mobile browsers.
- The web app shall state each bot state with a text label next to its color, for accessibility.
- The web app shall list the group conversations in the sidebar, provide a dialog that creates a group of 2 to 6 bots with a lead, and show a group's members, lead and their states above its timeline.

### Event-driven

- When the stream delivers an event, the web app shall update the roster, the open timeline and the approvals inbox without a page reload.
- When the user answers an approval card or sends or discards a draft card, the web app shall call the API and show the card's new state.
- When the stream connection drops, the web app shall reconnect with backoff and reload the open timeline.

## Acceptance criteria

1. [verified] The roster renders pinned bots first, groups by role, and shows the state label for each bot — verified by `packages/web/test/roster.test.tsx`.
2. [verified] The timeline renders a message, an event and an approval card, and pressing "Allow once" calls the approvals API — verified by `packages/web/test/timeline.test.tsx`.
3. [verified] Switching the language to English and back to pt-BR changes the interface texts — verified by `packages/web/test/i18n.test.tsx`.
4. [verified] Typing `@` in the composer offers the member handles and `/` offers the skills — verified by `packages/web/test/composer.test.tsx`.
5. [verified] In a real browser, a user creates a bot, sends it a message and sees the reply appear — verified by `tests/e2e/skeleton.test.ts`.
6. [verified] In a real browser, a user creates a group in the dialog, picks a member from the `@` autocomplete, gets only that member's reply, and sees a handoff card with the receiver's answer — verified by `tests/e2e/collaboration.test.ts`.
7. [verified] A handoff card shows sender, receiver, task, context and state, and the receiver's reply shows which item it answers — verified by `packages/web/test/collab.test.tsx`.
8. [verified] The computer panel shows the computer's state, the latest screenshot (or noVNC for a desktop), and sends Take over and Hand back — verified by `packages/web/test/computer.test.tsx`.
9. [verified] In a real browser, after a bot opens a page, the user sees that page in the computer panel, takes over, hands back and switches to full screen — verified by `tests/e2e/computer.test.ts`.
10. [verified] In a real browser, a user writes a skill in the skills screen, invokes it with the `/` autocomplete, and creates, tests and enables a routine whose cards appear in the conversation — verified by `tests/e2e/skills-routines.test.ts`.
11. [verified] The secret-request card posts the masked value to the vault route (or declines), and the usage screen shows runs, tokens, cost, the subscription part and the cap per bot — verified by `packages/web/test/secrets-usage.test.tsx`.
12. [verified] In a real browser, a user answers a bot's secret request in the masked card, the bot's command uses the value, and the value appears nowhere on the page — verified by `tests/e2e/secrets.test.ts`.

## Maturity

**MVP (committed):**

- Roster, timeline with cards and steps, composer, settings screens, approvals inbox, computer view, i18n, PWA.

**Future (aspirational, not committed):**

- Native mobile apps with push notifications.
- A wallpaper for the bot's computer that follows the time of day.

## Out of scope for this spec

- Native window, tray and notifications (see `specs/desktop-app`).
