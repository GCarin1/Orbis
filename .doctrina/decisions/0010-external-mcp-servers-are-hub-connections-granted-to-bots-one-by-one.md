# ADR 0010 — External MCP servers are hub connections granted to bots one by one

- **Status:** accepted
- **Scope:** tool-gateway, web-app, secrets, approvals
- **Date:** 2026-09-28
- **Deciders:** project owner (asked for a functional marketplace: click and connect, then choose the tools and MCPs of each bot), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/mcp/connections.ts`, `packages/hub/src/mcp/client.ts`, `packages/hub/src/mcp/oauth.ts`, `packages/shared/src/tools.ts`, `packages/hub/test/mcp-servers.test.ts`
- **Landed:** —

## Context

ADR 0004 serves one tool registry to every brain, in process and over MCP.
The project owner wants third-party tools — Notion, GitHub, search engines,
any MCP server — connected with a click, and to pick which bots get them.
CLI brains could each be pointed at MCP servers themselves, but then every
brain kind needs its own configuration, keys would sit in their config
files, and Orbis's policy, approvals and redaction would not see the calls.

## Decision

The hub is the MCP *client*. A connected server — started by the hub
(stdio) or reached over streamable HTTP — is a hub-wide connection; its keys,
tokens and OAuth sign-in are hub secrets encrypted with the vault's key. Its
tools join the one registry as `mcp.<server>.<tool>` and every brain reaches
them the way it reaches Orbis's own tools, through the gateway (policy,
approvals, untrusted envelope, result cap). A bot gets a server's tools only
when its allowlist names them with a pattern that starts with `mcp.`: `*`
never includes an external tool, and `!pattern` excludes. A server's tools
that are not read-only ask before running unless a rule allows them.
Accounts sign in with the MCP authorization flow (discovery, dynamic client
registration, PKCE) through the hub's loopback callback.

## Alternatives considered

1. Configure each CLI brain's own MCP servers — rejected: per-brain formats,
   keys in their files, and calls invisible to the policy and approvals.
2. Give every bot every connected server — rejected: one connection would
   reach every bot; the user chooses per bot.
3. Depend on the official MCP SDK — rejected for now: Orbis already speaks the
   protocol as a server (ADR 0004); a small client of the same messages keeps
   one dependency set.

## Consequences

**Positive**

- One click connects a service for any brain; keys never reach a brain or a
  config file; every call is governed and logged like the rest.

**Negative**

- The hub runs third-party programs (stdio servers) on its machine with the
  user's environment; the marketplace lists only packages and endpoints that
  were checked, and custom servers are the user's call.

**Neutral**

- Allowlists gain `!` exclusions and the rule that `*` covers Orbis's tools only.
