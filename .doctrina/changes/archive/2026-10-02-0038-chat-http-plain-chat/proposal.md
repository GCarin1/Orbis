# Change 0038-chat-http-plain-chat — chat-http plain chat

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: fix)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change
## Why

The owner's connection test (change 0037) got through by every way — Windows'
curl, Git's curl and even Node, all with no proxy — so the way out was never the
problem. The test sends a GET with no body; the bot's messages, still blocked, are
POSTs whose text starts with about 6,000 characters of Orbis's instructions: a
shell (`/bin/sh`, `cmd.exe`), file paths, `{{secret:NAME}}` placeholders, an
`<untrusted-content>` tag and a list of tools that run commands and fetch URLs.
Cloudflare's own page says a block can come from "submitting a certain word or
phrase". The owner's "ola" from the browser passes. A firewall with attack rules
reads Orbis's instructions as an attack.

Saving the way the test found also failed: Windows lists its curl as
`C:\WINDOWS\system32\curl.EXE`, and the schema accepted only `curl.exe`; the web
app said only "the request does not match its schema".

## What

- `chat.plain` (Plain chat, no tools): the bot sends only its name, role and
  description, its memories and the conversation — no house rules, computer
  description or tool list — and has no tools. A choice the owner makes; Orbis
  does not reword or disguise its instructions to get past the firewall.
- The firewall error for a message points to the connection test and to plain
  chat; the connection test says it sends no message and what a blocked message
  then means.
- The curl program's name is matched in any case; a refused save names its field.
- Tests: a firewall that reads the message (`chat-http.test.ts`), the web settings
  (`chat-http.test.tsx`). Docs: `docs/brains.md`, CHANGELOG, the contract.

## Scope boundaries

- Orbis does not probe the firewall to learn which words it lets through, and does
  not encode its messages to slip past it: that is a company's security control.
- A bot with plain chat uses no tools; tools through such a chat need the company
  to allow it.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
