# Spec — web-app

**Capability:** web-app
**Status:** active
**Implementation:** planned — in progress: roster, direct chat, approval and draft cards, the approvals inbox, languages and the end-to-end path are verified; groups, composer autocomplete, settings and computer screens land with their capabilities
**Realizes:** SC7, SC4, SC5
**Depends on:** hub-api
**Last updated:** 2026-09-27
**Version:** 0.3.0

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

### Event-driven

- When the stream delivers an event, the web app shall update the roster, the open timeline and the approvals inbox without a page reload.
- When the user answers an approval card or sends or discards a draft card, the web app shall call the API and show the card's new state.
- When the stream connection drops, the web app shall reconnect with backoff and reload the open timeline.

## Acceptance criteria

1. [verified] The roster renders pinned bots first, groups by role, and shows the state label for each bot — verified by `packages/web/test/roster.test.tsx`.
2. [verified] The timeline renders a message, an event and an approval card, and pressing "Allow once" calls the approvals API — verified by `packages/web/test/timeline.test.tsx`.
3. [verified] Switching the language to English and back to pt-BR changes the interface texts — verified by `packages/web/test/i18n.test.tsx`.
4. [unverified] Typing `@` in the composer offers the member handles and `/` offers the skills — verified by `packages/web/test/composer.test.tsx`.
5. [verified] In a real browser, a user creates a bot, sends it a message and sees the reply appear — verified by `tests/e2e/skeleton.test.ts`.

## Maturity

**MVP (committed):**

- Roster, timeline with cards and steps, composer, settings screens, approvals inbox, computer view, i18n, PWA.

**Future (aspirational, not committed):**

- Native mobile apps with push notifications.
- A wallpaper for the bot's computer that follows the time of day.

## Out of scope for this spec

- Native window, tray and notifications (see `specs/desktop-app`).
