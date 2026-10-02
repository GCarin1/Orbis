# Tasks — Change 0032-chat-http-titles

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0032-chat-http-titles` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Hub: `generateTitle`/`titleMessage` and the background call when a run opens a chat (`chat.titles` respected).
- [x] Shared type, API schema and contract: `chat.titles`.
- [x] Web: the title box in the chat-http advanced settings, pt/en.
- [x] Tests: hub (title once, none when off, a 500 harmless) and web (box on by default, saves off).
- [x] Docs: `docs/brains.md` and CHANGELOG.
