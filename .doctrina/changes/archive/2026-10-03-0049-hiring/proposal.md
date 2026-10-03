# Change 0049-hiring — hiring

- **Status:** applied
- **Applied:** 2026-10-03
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** hiring
- **Documented surface:** n/a — documented in docs/hiring.md and docs/api.md with this change

## Why

The owner asked for a hiring area (RH, contratação).
- AI generates personas to hire, based on the current project's scope or on
  the team the user has.
- The user sees at least twenty résumés.
- Those résumés are short, to save tokens.
- A hire then comes complete: skills, what it is, where it sits, what it
  needs and what it will do.

## What

- Hub:
  - `hiring/prompt.ts`: the résumé and profile prompts, reading the answers,
    skill names, and the allowlist.
  - `hiring/service.ts`:
    - rounds, More, Dismiss, Delete;
    - a hire writes the profile and makes the bot: brain and key, own
      skills, group, lead, and a first message;
    - each answer is a run of the recruiter (`trigger: hiring`);
    - routes and `hiring.*` events.
  - `brains/ask.ts`: one question to a brain. The brain test uses it too.
  - Migration 10: `hiring_rounds` and `hiring_candidates`.
- Web:
  - `HiringScreen.tsx`: a new opening, rounds, candidate cards with tool
    logos, and the hire sheet.
  - The store keeps rounds live from the stream.
  - 💼 in the sidebar.
- Product: SC11. Spec: the new `hiring` capability. ADR 0015.
- Tests:
  - `packages/hub/test/hiring.test.ts`
  - `packages/web/test/hiring.test.tsx`
  - `tests/e2e/hiring.test.ts`, with a scripted recruiter in
    `tests/e2e/recruiter-brain.ts`
  - the phone sweep
- Docs: `docs/hiring.md`, `docs/api.md`, the READMEs, CHANGELOG, the contract.
- Skill `phone-layout-no-sideways-scroll`: the lesson of the round title,
  which the phone sweep found at 418 px.

## Scope boundaries

- No interview before a hire, and no new group made for the hires: they
  are listed as future work in the spec.
- The recruiter is one of the user's bots. Hiring adds no brain setting of
  its own.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
