# ADR 0008 — Secrets resolve only inside the tool gateway

- **Status:** accepted
- **Scope:** secrets, tool-gateway, computer
- **Date:** 2026-09-27
- **Deciders:** Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the secrets-and-usage change
- **Landed:** 2026-09-27 — `packages/hub/src/secrets/vault.ts`, `packages/hub/src/tools/gateway.ts`, `packages/hub/test/secrets.test.ts`

## Context

A bot needs credentials to act, but anything a brain sees can leak through
its replies, its logs or a prompt injection. The reference keeps requested
secrets outside the transcript and outside the model; Orbis must do the same
and also keep bots from reading each other's secrets.

## Decision

Secrets are stored encrypted per bot. Brains only ever see a placeholder
`{{secret:NAME}}`. The tool gateway replaces placeholders with values at the
moment a tool executes, for the calling bot's vault only, and redacts every
known secret value of that bot from the tool's output before it is stored or
returned. Secret values are entered through a masked form that posts directly
to the API, never through a chat message.

## Alternatives considered

1. Environment variables per bot — rejected: CLI brains could print them,
   and they would leak into every child process.
2. Letting the brain read the secret through a tool — rejected: defeats the
   purpose.

## Consequences

**Positive**

- A leaked transcript or prompt contains no credential.

**Negative**

- Redaction is string-based; a tool that transforms a secret (for example
  base64) before printing it escapes redaction. Documented as a known limit.

**Neutral**

- The master key lives outside the database, so a copied database alone
  reveals nothing.
