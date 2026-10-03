# ADR 0015 — Hiring writes short résumés first and a full profile only on hire

- **Status:** accepted
- **Scope:** hiring
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "não quero que gere o personagem por completo… quero uma versão minimizada dele, para não gastar tanto tokens… quando eu contratar, aí sim vai vir com skills, o que ele é… o que ele vai fazer"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/hiring/service.ts`, `packages/hub/src/hiring/prompt.ts`, `packages/hub/src/brains/ask.ts`
- **Landed:** 2026-10-03 — `packages/hub/src/hiring/service.ts`, `packages/hub/src/brains/ask.ts`

## Context

The owner wants a hiring area. Its AI generates candidates (personas) for the
current project or the current team, and the user hires the ones they like.
The owner wants to see about twenty résumés at a time, without paying for
twenty full personas. A hire must then come complete: who it is, what it will
do, what it needs, its skills and its tools.

## Decision

- **Two steps, two prompts.**
  - A round asks the brain once for N one-line JSON résumés: name, role, one
    headline sentence, three to five strengths, and tools. That is about 70
    output tokens each.
  - A hire asks for one full profile, about 800 tokens: instructions,
    responsibilities, needs, tools, one to three skills, and a first
    message. It is written only then, and becomes a bot.
- **The recruiter is a bot.** Its brain, with that bot's key, writes both.
  Hiring needs no new brain setting. Each answer is recorded as a run of that
  bot (`trigger: hiring`), so the spend shows in usage and counts toward the
  bot's cap.
- **One question, no conversation.** `askBrain` asks once, with no tools, no
  history and a scratch folder. The brain test (`testBrain`) now goes through
  the same function.
- **Only tools that exist.** The prompt lists the tools available now:
  computer, browser, web, and the connected MCP servers. Unknown tools in an
  answer are dropped. A hire's allowlist turns those tools into patterns.
- **A hire is a full bot.**
  - It gets the brain of a bot the user picks, the recruiter's by default,
    with that brain's key copied in the vault.
  - Its skills are bot-scoped SKILL.md files.
  - In a team round it joins the group and reports to the lead.
  - It posts its first message in its direct conversation.
- **Asynchronous.** Rounds and hires run in the background. Their state
  (generating, hiring) goes over the stream as `hiring.updated`.

## Alternatives considered

1. Full personas for every candidate. Rejected: it multiplies the cost by
   about ten, for candidates who are mostly dismissed.
2. A recruiter brain set apart from the bots (a hub-wide setting). Rejected:
   it would be one more place to configure a brain and a key, and its spend
   would show in no bot's usage.
3. Generating through a normal run in a conversation. Rejected: résumés
   would fill a chat, and tools and history would add tokens for no gain.

## Consequences

**Positive**

- Twenty résumés cost about what one or two full personas would.
- Every hire is ready at once: instructions, tools, skills, team and a
  greeting.

**Negative**

- The quality of the résumés is the recruiter brain's. A brain that ignores
  the format gives a failed round, with the start of its answer shown.
- The hire's profile is written later than its résumé, so details can differ
  a little from what the card promised.
