# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
set-header Implementation: verified — the registry, the allowlist with `!` exclusions, MCP over HTTP and stdio, untrusted envelopes, the result cap, and the MCP client with the marketplace (`packages/hub/src/mcp/`: stdio and streamable HTTP, OAuth sign-in, keys as hub secrets, 41 free servers with their logos, marketing among them)
append-requirement ubiquitous: The system shall list marketing servers in their own Marketplace category: the platforms' official ad servers signed in with the user's business account (Meta Ads, TikTok Ads), Google's official read-only Analytics server, and an Instagram server for a Business or Creator account, pinned to the version that was checked because it holds a token that can post.
append-requirement unwanted: The system shall not list a server that works by driving the user's logged-in session against the service's terms (such as LinkedIn's unofficial servers).
append-criterion [verified] The Marketing category holds Meta Ads and TikTok Ads (hosted, sign-in), Google Analytics (pipx, read-only, its credentials file and project) and Instagram (pinned version, secret token), and no LinkedIn; Orbis's sign-in finds Meta's and TikTok's authorization servers from the metadata they publish and registers itself with each — verified by `packages/hub/test/mcp-marketing.test.ts`
append-criterion [verified] On a phone, a connect sheet whose help holds a long command (Google Analytics') wraps it instead of scrolling sideways — verified by `tests/e2e/phone-layout.test.ts`
```
