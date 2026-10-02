# Tasks — Change 0035-chat-http-curl-transport

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0035-chat-http-curl-transport` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Hub: `http-transport.ts` (curl and fetch behind one interface) and `chat-http.ts` on it for the message, the history and the title.
- [x] Shared and schema: the twelve browser headers, `chat.transport`.
- [x] Stream: `message_complete` (reply, chat id, `tokenUsage`), follow-up block dropped, no history read.
- [x] Errors: the 403 names Cloudflare, the program and what was sent.
- [x] Web: the HTTP call choice and the header count; pt/en.
- [x] Tests: `chat-http.test.ts`, `http-transport.test.ts`, `chat-http.test.tsx`; docs, contract, CHANGELOG.
