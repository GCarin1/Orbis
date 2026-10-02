# Change 0035-chat-http-curl-transport — chat-http curl transport

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: fix)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change
## Why

After change 0033 the owner's `chat-http` bot still got HTTP 403 in the company's
network, now with a page that says it comes from Cloudflare ("Sorry, you have been
blocked"). The same cURL, copied from the browser, works in a terminal and in
Postman. A firewall like Cloudflare judges how the client speaks — HTTP/2, the
TLS handshake, the header set — and Node's own HTTP client, which Orbis used,
speaks HTTP/1.1 with a Node handshake. Orbis also sent only 3 of the browser's 14
headers, and its error blamed a `Referer` that the owner's cURL never had.

The owner also showed the chat's real stream: `stream_started`, `message_chunk`
and a `message_complete` that holds the whole answer, the chat id and the token
usage. Reading that makes the second request (the history) unnecessary.

## What

- Hub: `http-transport.ts` — one request interface over the system's `curl`
  (headers in a private temporary file, body on stdin, `--include` for the status
  and content type, streamed) and over Node's `fetch`; curl is the default when
  installed, `chat.transport` forces either. `chat-http.ts` makes the message,
  the history and the title through it.
- The browser headers kept from a cURL grow to the twelve a browser sends
  (`sec-ch-ua*`, `sec-fetch-*`, `cache-control`, `pragma`, `priority` besides
  `user-agent`, `accept-language`, `referer`); the 403 error names Cloudflare,
  the program used and what was sent, and no longer blames a header the owner's
  cURL did not have.
- The stream's `message_complete` is the answer, the chat id and the tokens; the
  follow-up block is dropped from a streamed fallback; no history read when it came.
- Web: an **HTTP call** choice (automatic, curl, Node) and a header count in the
  chat-http advanced settings. Docs: `docs/brains.md`, CHANGELOG, the contract.

## Scope boundaries

- Orbis does not impersonate a browser beyond what the owner's own cURL sent, and it
  cannot make a firewall accept what it refuses: when curl is blocked too, the
  error says what to compare.
- The proxy and certificate settings are curl's own (`HTTPS_PROXY`, the system's
  store on Windows); Orbis adds none.
- Tested here with the real curl, a fake curl and a fake firewall; not against
  the owner's Cloudflare.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
