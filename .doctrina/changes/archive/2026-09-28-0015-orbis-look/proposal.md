# Change 0015-orbis-look — orbis-look

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: design)
- **Affects specs:** web-app, bots, templates

## Why

The project owner asked for a design as close as possible to Grok Bot's —
the arrangement of elements, spacing and type — without copying it, with a
bot face like Grok Bot's sphere with two eyes made in Orbis's own identity,
and with the way bots talk to each other front and centre. The web app still
looked like a first version: a roster grouped by role with initials avatars,
a timeline with a header on every message, and dialogs.

## What

- Bot faces (`Avatar.tsx`): an SVG face per bot — eight shapes, ten colors,
  shaded like a sphere, two eyes — whose motion follows its state (float and
  blink, look up, bounce, pulse, shake, smile) and whose accessible name says
  the state; the `orb` carries the Orbis orbit ring; the mascot is the orb in
  the brand gradient (`docs/brand/mascot.svg`, sign-in screen, empty states).
- `Bot.avatar.shape` (migration 4, `avatarShape` on create, patch,
  duplicate and templates), with the new ten-color palette; color and shape
  derived by hash when none is given.
- Layout (`App.tsx`, `Sidebar.tsx`, `Timeline.tsx`, `Composer.tsx`,
  `BotPanel.tsx`, `NewBotScreen.tsx`, `Icons.tsx`, `styles.css`): search and
  one list of bots and groups (pinned, then latest activity) with unread dots
  kept per browser; bottom navigation and the user; a thin header with icon
  buttons; dark user bubbles and light bot bubbles, time separators,
  "Messages from …", mention chips in each bot's color, reactions, compact
  handoff cards; the pill composer with a mention button and `@role`
  suggestions; the bot panel with its screen, routines in words, team and
  brain; the new-bot screen with face pickers, manager and suggestions;
  reports-to and face pickers in bot settings; dark mode; the phone layout.
- Tests: web `sidebar`, `look`, `newbot` (new), updated `brains`, `collab`,
  `i18n`; e2e `team` (new), updated `skeleton`, `collaboration`,
  `templates`; hub `bots`, `templates`.
- Docs: READMEs with screenshots, `docs/brand/README.md` (faces and the
  mascot), CHANGELOG; contract hub-surface (avatar shape).

## Scope boundaries

- The app icon and favicon stay the brand mark; the mascot is used inside
  the app.
- Voice input (the microphone in Grok Bot's composer) is not part of this
  change.

## Verification

- [x] Automated checks pass (`doctrina verify`), including the new web and end-to-end tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).
- [x] The new look renders in light and dark mode, on a desktop and on a phone (checked in screenshots, `docs/screenshots/`).

## Open questions

- None.
