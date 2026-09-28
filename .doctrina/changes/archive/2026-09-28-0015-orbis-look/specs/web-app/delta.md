# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: verified — the Orbis look: bot faces with state motion, one conversation list with search and unread dots, dark and light bubbles with time separators and "Messages from", mention chips, the pill composer, the bot panel (screen, routines, team, brain), the new-bot screen with face pickers and suggestions, the phone layout; timeline cards, the skills, usage, routines, computer, bot settings and brains settings screens, approvals inbox, languages, PWA and the end-to-end paths
bump-version minor
replace-requirement ubiquitous 1: The web app shall show a sidebar with a search field and one list of conversations — each visible bot and each group — pinned first and then by latest activity, each with the bot's face (or its members' faces), its name, what it is doing or said last, the time and an unread dot.
replace-requirement ubiquitous 2: The web app shall show a conversation's timeline with the user's messages on the right in dark bubbles and the bots' on the left in light bubbles, a time separator after a pause of 20 minutes, a "Messages from …" label when other bots speak in a bot's own conversation, mentions drawn in the mentioned bot's color with its face, reactions, the approval, draft, handoff, secret-request and routine cards, thread replies, and each run's steps as a collapsible list.
replace-requirement ubiquitous 3: The web app shall provide a composer with a button that starts a mention, autocomplete for `@handle` and `@role` mentions and `/skill` invocations, and a send button.
replace-requirement ubiquitous 7: The web app shall state each bot's state in words: in its face's accessible name, and as a visible label while the bot is not idle.
replace-requirement ubiquitous 8: The web app shall list group conversations in the same list as the bots, provide a dialog that creates a group of 2 to 6 bots with a lead, and show a group's members, lead and their states above its timeline.
append-requirement ubiquitous: The web app shall draw each bot as a face: one of eight shapes (orb, blob, square, pill, triangle, hexagon, cloud, drop) in the bot's color with two eyes, the orb with the Orbis orbit ring, moving with the bot's state unless the user asks for reduced motion.
append-requirement ubiquitous: The web app shall provide a new-bot screen with a live preview of the face, ten colors and the eight shapes to choose from, name, role, manager and brain fields, suggestions that fill them in, and template import.
append-requirement ubiquitous: The web app shall show beside a bot's conversation a panel with the bot's screen, its routines with their schedule in words, the bot it reports to and its reports, and its brain.
append-requirement ubiquitous: The web app shall, on a screen narrower than 760 px, show either the conversation list or one conversation with a back button.
replace-requirement event 1: When the stream delivers an event, the web app shall update the conversation list, the open timeline and the approvals inbox without a page reload.
append-requirement event: When a timeline item arrives in a conversation the user is not looking at, the web app shall mark that conversation unread until the user opens it.
replace-criterion 1: [verified] The sidebar lists bots and groups in one list, pinned first then by latest activity, with each bot's face and its state in words, an unread dot, search by name, handle or role, the + menu for a new bot or group, and an invitation to create the first bot — verified by `packages/web/test/sidebar.test.tsx`.
append-criterion [verified] A face draws its shape and color with two eyes, the orb with its ring and happy eyes when done; the timeline separates pauses with the time, introduces colleagues once per stretch as "Messages from", colors mentions and shows reactions; the bot panel shows the screen, routines in words, the team and the brain — verified by `packages/web/test/look.test.tsx`.
append-criterion [verified] The new-bot screen previews the chosen color and shape, sends name, role, manager, brain and face, and a suggestion fills everything in, a specialist reporting to the team's chief — verified by `packages/web/test/newbot.test.tsx`.
append-criterion [verified] In a real browser, the user asks the chief, the chief delegates to its reports, their answers appear under "Messages from", the chief reports back on its own, a message elsewhere lights that conversation's unread dot, and the bot panel links the team — verified by `tests/e2e/team.test.ts`.
```
