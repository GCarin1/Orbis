# Spec — web-app

**Capability:** web-app
**Status:** active
**Implementation:** verified — the Orbis look: bot faces with state motion, one conversation list with search and unread dots, dark and light bubbles with time separators and "Messages from", mention chips, the pill composer, the bot panel (screen, routines, team, brain), the new-bot screen with face pickers and suggestions, the phone layout; timeline cards, the skills, usage, routines, computer, bot settings and brains settings screens, approvals inbox, languages, PWA and the end-to-end paths
**Realizes:** SC7, SC4, SC5
**Depends on:** hub-api
**Last updated:** 2026-09-27
**Version:** 0.10.0

## Purpose

The web app is the main way people work with their bots, and it is the same
code the desktop app shows. It is organised around bots, not around
conversations: the sidebar is the roster, each bot's state is always visible,
and the conversation is one timeline with messages, events, cards and each
run's steps.

## Requirements (EARS)

### Ubiquitous

- The web app shall show a sidebar with a search field and one list of conversations — each visible bot and each group — pinned first and then by latest activity, each with the bot's face (or its members' faces), its name, what it is doing or said last, the time and an unread dot.
- The web app shall show a conversation's timeline with the user's messages on the right in dark bubbles and the bots' on the left in light bubbles, a time separator after a pause of 20 minutes, a "Messages from …" label when other bots speak in a bot's own conversation, mentions drawn in the mentioned bot's color with its face, reactions, the approval, draft, handoff, secret-request and routine cards, thread replies, and each run's steps as a collapsible list.
- The web app shall provide a composer with a button that starts a mention, autocomplete for `@handle` and `@role` mentions and `/skill` invocations, and a send button.
- The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, settings (the brains on the hub's machine and the brain of each bot), the approvals inbox, and the computer view as a side panel and full screen.
- The web app shall show every text in pt-BR or English, following the browser language, with a manual switch that is remembered.
- The web app shall ship a web app manifest and a service worker so it can be installed on desktop and mobile browsers.
- The web app shall state each bot's state in words: in its face's accessible name, and as a visible label while the bot is not idle.
- The web app shall list group conversations in the same list as the bots, provide a dialog that creates a group of 2 to 6 bots with a lead, and show a group's members, lead and their states above its timeline.
- The web app shall show the brain and model of the open bot next to its name.
- The web app shall draw each bot as a face: one of eight shapes (orb, blob, square, pill, triangle, hexagon, cloud, drop) in the bot's color with two eyes, the orb with the Orbis orbit ring, moving with the bot's state unless the user asks for reduced motion.
- The web app shall provide a new-bot screen with a live preview of the face, ten colors and the eight shapes to choose from, name, role, manager and brain fields, suggestions that fill them in, and template import.
- The web app shall show beside a bot's conversation a panel with the bot's screen, its routines with their schedule in words, the bot it reports to and its reports, and its brain.
- The web app shall, on a screen narrower than 760 px, show either the conversation list or one conversation with a back button.

### Event-driven

- When the stream delivers an event, the web app shall update the conversation list, the open timeline and the approvals inbox without a page reload.
- When the user answers an approval card or sends or discards a draft card, the web app shall call the API and show the card's new state.
- When the stream connection drops, the web app shall reconnect with backoff and reload the open timeline.
- When the desktop app reports a notification click, the web app shall open that notification's conversation — the group, or the bot of a direct conversation.
- When the user presses Test on a brain or a bot in the settings screen, the web app shall call the brain test and show the reply and its duration, a warning when no model answered, or the error.
- When the user picks the `ollama` or `lmstudio` brain for a bot, the web app shall suggest the models that server has and say when it is not running.
- When a timeline item arrives in a conversation the user is not looking at, the web app shall mark that conversation unread until the user opens it.

## Acceptance criteria

1. [verified] The sidebar lists bots and groups in one list, pinned first then by latest activity, with each bot's face and its state in words, an unread dot, search by name, handle or role, the + menu for a new bot or group, and an invitation to create the first bot — verified by `packages/web/test/sidebar.test.tsx`.
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
13. [verified] The bot settings panel edits identity, brain, policy rules and grants, computer, allowlists and the spend cap in one patch, and asks before deleting — verified by `packages/web/test/settings.test.tsx`.
14. [verified] In a real browser, a user edits a bot's settings, exports it as a template file and imports that file as a new bot — verified by `tests/e2e/templates.test.ts`.
15. [verified] Opening a conversation by id selects the group, or the bot whose direct conversation it is — verified by `packages/web/test/desktop.test.tsx`.
16. [verified] The settings screen shows installed and missing CLIs with install hints, local servers with their models (or off), and each bot's brain; it tests a brain or a bot and shows the answer, the echo warning or the error, and Configure opens the bot; the new-bot dialog offers Cursor, Ollama and LM Studio and suggests the Ollama models — verified by `packages/web/test/brains.test.tsx`.
17. [verified] In a real browser, a user opens Settings, sees a local server's models, tests it and a bot on the Cursor CLI (both answer 391), sees the mock bot flagged as an echo, and opens a bot's brain settings from the list — verified by `tests/e2e/settings.test.ts`.
18. [verified] A face draws its shape and color with two eyes, the orb with its ring and happy eyes when done; the timeline separates pauses with the time, introduces colleagues once per stretch as "Messages from", colors mentions and shows reactions; the bot panel shows the screen, routines in words, the team and the brain — verified by `packages/web/test/look.test.tsx`.
19. [verified] The new-bot screen previews the chosen color and shape, sends name, role, manager, brain and face, and a suggestion fills everything in, a specialist reporting to the team's chief — verified by `packages/web/test/newbot.test.tsx`.
20. [verified] In a real browser, the user asks the chief, the chief delegates to its reports, their answers appear under "Messages from", the chief reports back on its own, a message elsewhere lights that conversation's unread dot, and the bot panel links the team — verified by `tests/e2e/team.test.ts`.

## Maturity

**MVP (committed):**

- Roster, timeline with cards and steps, composer, settings screens, approvals inbox, computer view, i18n, PWA.

**Future (aspirational, not committed):**

- Native mobile apps with push notifications.
- A wallpaper for the bot's computer that follows the time of day.

## Out of scope for this spec

- Native window, tray and notifications (see `specs/desktop-app`).
