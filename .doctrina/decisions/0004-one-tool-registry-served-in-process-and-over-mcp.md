# ADR 0004 — One tool registry served in-process and over MCP

- **Status:** accepted
- **Scope:** tool-gateway, agent-runtimes, cli
- **Date:** 2026-09-27
- **Deciders:** Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the tools-and-approvals change
- **Landed:** 2026-09-27 — `packages/hub/src/tools/registry.ts`, `packages/hub/src/tools/gateway.ts`, `packages/hub/src/mcp/protocol.ts`, `packages/hub/src/mcp/bridge.ts`

## Context

Capabilities belong to the account and must reach every brain the same way,
with the same policy. API brains call tools through the hub's agent loop; CLI
brains can only call tools they discover through MCP. Keeping two tool
implementations would let the policy drift between them.

## Decision

Tools are defined once in the hub's registry (name, description, JSON
Schema, risk class, handler). API adapters call the registry in-process.
The same registry is served over MCP at `/mcp`, authenticated by a
per-run token, and the `orbis mcp` command is a stdio MCP server that
forwards to it, because every MCP-capable CLI supports stdio servers.
Every call, from either path, goes through the same policy evaluation.

## Alternatives considered

1. Implementing tools as separate MCP servers per capability — rejected:
   more processes per run and the policy check would be repeated in each.
2. HTTP-only MCP — rejected: not every CLI supports remote MCP servers.
3. Using the official MCP SDK — rejected for the MVP: the server side
   Orbis needs is four JSON-RPC methods; a small in-house implementation keeps
   the hub dependency-light. Revisit if MCP features beyond tools are needed.

## Consequences

**Positive**

- One place defines what a bot can do; one place decides whether it may.
- External agents can use Orbis tools too, given a run token.

**Negative**

- Orbis owns an MCP implementation and must follow protocol revisions.

**Neutral**

- Tool names use dots internally and underscores on the MCP wire.
