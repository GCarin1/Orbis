# Spec Delta — capability: hiring

**Operation:** ADDED
**Target spec on apply:** `.doctrina/specs/hiring/spec.md`

---

# Spec — hiring

**Capability:** hiring
**Status:** active
**Implementation:** verified — `packages/hub/src/hiring/` (prompts, rounds, candidates, hires, routes), `packages/hub/src/brains/ask.ts` (one question to a brain), the web app's Hiring screen (`HiringScreen.tsx`)
**Realizes:** SC11
**Depends on:** bots, agent-runtimes, skills, conversations, usage, tool-gateway
**Last updated:** 2026-10-03
**Version:** 0.1.0

## Purpose

Hiring is how a user adds AI teammates without writing them. A recruiter
bot's brain writes short résumés of candidates for a project or for one of
the user's groups. They are short so that twenty fit in one small answer. The
user hires only the ones they want. Only then does the brain write the full
profile: standing instructions, responsibilities, needs, tools and skills.
That profile becomes a bot, which says hello in its conversation.

## Requirements (EARS)

### Ubiquitous

- The system shall keep hiring rounds and their candidates.
  - A round holds its basis: a project's scope typed by the user, or one of the user's groups with an optional focus.
  - A round also holds the recruiter bot, how many résumés were last asked, its state (generating, ready, failed) and the tokens and cost it spent.
  - A candidate holds a name, a role, a one-sentence headline, three to five strengths, the tools it would use, and its state (open, hiring, hired, dismissed).
- The system shall offer a candidate only the tools available when the round is written: the computer, the browser, the web, and each connected MCP server.
- The system shall count every answer of the recruiter's brain as a run of the recruiter bot, so hiring shows in usage and counts toward that bot's spend cap.
- The web app shall provide a Hiring screen, 💼 in the sidebar.
  - A new opening asks for a project's scope or a team with an optional focus, how many candidates (1 to 30), and the recruiter, and estimates the tokens.
  - Each round lists its candidates: face, name, role, headline, strengths, and tools with their logos.
  - A round offers More and Delete; a candidate offers Hire, Dismiss and Bring back.

### Event-driven

- When the user asks for N candidates (1 to 30), the system shall ask the recruiter's brain once, with no tools and no history, for N one-line résumés in the user's language.
  - The brain gets the work: the project's scope, or the group's name, description, members, latest 20 messages and the focus.
  - It also gets the tools available.
  - The system keeps the valid résumés, and only the known tools in them.
- When the user asks for more candidates in a round, the system shall tell the brain the names and roles already in the team and in the round, and drop a repeated name.
- When the user hires a candidate, the system shall ask the recruiter's brain for the full profile: standing instructions, responsibilities, needs, tools, one to three skills and a first message.
- When the full profile comes, the system shall create a bot from it.
  - It takes the candidate's name and role, and the instructions with the responsibilities.
  - Its allowlist covers every Orbis tool except the computer, browser and web groups it does not take, plus the MCP servers it takes.
  - Its skills are its own.
  - It gets the brain of the bot the user picked, and that brain's key.
  - In a team round it joins the group and reports to the group's lead, unless the user chooses otherwise.
  - The bot then posts its first message: hello, what it will do and what it needs.
- When the user opens a candidate's hire sheet, the web app shall offer the brain (the recruiter's by default), the manager (the group's lead in a team round) and joining the group, and say what the profile costs.

### Unwanted-behavior (must-not)

- The system shall not write a full profile before the user hires the candidate.
- The system shall not create a bot when the profile does not come in the format asked; the candidate stays open with the reason.
- The system shall not start a round or a hire for a recruiter whose spend cap is reached this month.

## Acceptance criteria

1. [verified] The prompts and the answers:
   - The résumé task asks for N lines, in the user's language, with only the tools available, naming who not to repeat.
   - Lines, an array or a fenced block are read; junk and repeated names are skipped; unknown tools are dropped; reading stops at the count.
   - The profile is read, and its skills get names Orbis accepts.
   - Tools become an allowlist.
   Verified by `packages/hub/test/hiring.test.ts`.
2. [verified] A round:
   - writes résumés for a project and counts their cost as a run of the recruiter (in usage);
   - reads a team's group, members, latest messages and focus;
   - adds more without repeats;
   - dismisses, brings back and deletes;
   - says why it failed;
   - refuses a project with no scope, an unknown group, more than 30, and a recruiter at its spend cap.
   Verified by `packages/hub/test/hiring.test.ts`.
3. [verified] A hire:
   - writes the profile only then;
   - makes a bot with the instructions and responsibilities, the allowlist, its own skills, the brain and its key, the group and the lead as manager, and a first message with what it will do and needs;
   - happens once;
   - when the profile does not come, leaves the candidate open with the reason and creates no bot.
   Verified by `packages/hub/test/hiring.test.ts`.
4. [verified] The screen:
   - asks for N résumés of a project or a team, by the recruiter whose role says so, with the token estimate;
   - needs a bot first;
   - shows each candidate with its tools and their logos;
   - dismisses and brings back, opens a hire's chat, and asks for more;
   - shows a round at work and a failed one;
   - the hire sheet offers the brain, the manager and the group, and sends the user's choices.
   Verified by `packages/web/test/hiring.test.tsx`.
5. [verified] In a real browser, the user describes a project, gets five résumés over the stream, hires one, and opens its chat, where the new bot says what it will do and what it needs — verified by `tests/e2e/hiring.test.ts`.
6. [verified] At 390 px, the Hiring screen, a team opening and the hire sheet scroll nothing sideways — verified by `tests/e2e/phone-layout.test.ts`.

## Maturity

**MVP (committed):**

- Rounds of short résumés for a project or a team, More, Dismiss, Delete; a hire that writes the full profile and makes a bot (change 0049).

**Future (aspirational, not committed):**

- An interview: a question to a candidate before hiring it.
- Hiring into a new group made for the hires.

## Out of scope for this spec

- Writing a bot by hand (see `specs/bots`) and bot templates (see `specs/templates`).
- Which brains exist and how they run (see `specs/agent-runtimes`).
