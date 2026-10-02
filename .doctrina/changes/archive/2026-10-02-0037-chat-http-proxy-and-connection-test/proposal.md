# Change 0037-chat-http-proxy-and-connection-test — chat-http proxy and connection test

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: fix)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change
## Why

With change 0035 the owner's bot called the chat API through curl, with all eleven
browser headers of their cURL, and Cloudflare still answered "Sorry, you have been
blocked". So the headers were not what it judged. What the browser and Postman
(which work) share, and curl lacked, is the way out of the computer: both use the
proxy Windows is set to — in a company, often a PAC script — and curl ignores it.
A firewall in front of an `internal-api` path that lets through only the company's
proxy fits what was seen. Orbis cannot see the owner's network, so it also needs a
way to find out which way gets through.

## What

- Hub (`http-transport.ts`): `windowsProxy` (PowerShell's
  `GetSystemWebProxy().GetProxy(url)`, PAC included, asked once per address),
  `envProxy`, `curlCandidates` (PATH, Windows' own, Git's), and curl given
  `--proxy … --proxy-anyauth --proxy-user :` (the logged-in user's sign-in) or
  `--noproxy *` for `direct`; `resolveTransport` picks the bot's curl and proxy.
- Hub (`chat-http.ts`): `checkConnection` and `POST /bots/:id/chat-check` — one
  GET of the chats' list by each way out, with a verdict each; the firewall error
  points to it. `chat.curl` (a program named curl) and `chat.proxy` in the brain;
  templates neither carry nor set them.
- Web: **Test connection** with the list and **Use this way**; the curl program and
  proxy fields in Advanced.
- Tests: a forward proxy and a firewall that lets through only what came through
  it; a fake curl for the arguments. Docs: `docs/brains.md`, CHANGELOG, contract.

## Scope boundaries

- PAC scripts are evaluated by Windows, not by Orbis; a proxy that needs a typed
  password is not supported (the logged-in user's sign-in is).
- Node's fetch still goes direct: it has no proxy support without a new dependency.
- Tested with a fake proxy and firewall here, not on the owner's network.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
