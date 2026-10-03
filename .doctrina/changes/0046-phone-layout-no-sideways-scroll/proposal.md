# Change 0046-phone-layout-no-sideways-scroll — phone layout no sideways scroll

- **Status:** proposed
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** web-app
- **Documented surface:** n/a — a layout fix; no command, flag, endpoint or setting changes

## Why

On a phone, the bot's settings (where the brain is chosen) scrolled
sideways. The owner sent a screenshot. Measured at 390 px, the panel was
600 px wide. The cause: the brain `<select>` takes the width of its longest
option, and its `<fieldset>` never shrinks below its content (the default
`min-inline-size: min-content`). The owner asked for a Doctrina skill so
that bugs like this one are not made again.

## What

- `styles.css` sets these rules once, for every screen:
  - every fieldset may shrink (`min-inline-size: 0`);
  - inputs, selects and textareas stay inside their box (`max-width: 100%`).
- A sweep at 390 px that opens every screen, panel and dialog found two
  more bugs, now fixed:
  - The new-bot form was 509 px wide. Its grid now uses `minmax(0, 1fr)`
    tracks, and becomes one column on a phone.
  - The brains table (Settings) and the usage table moved their whole
    screen sideways. Each one now scrolls inside its own `.table-scroll`
    box.
- Test: `tests/e2e/phone-layout.test.ts`, which sweeps these at 390 px:
  - the list, a conversation, its details;
  - the bot's settings with each brain, its routines and its computer;
  - the new-bot screen and the new-group dialog;
  - a group, its info, its search, its menu, its add-members dialog;
  - each Settings tab;
  - MCP, Skills and Usage.
- Skill: `.doctrina/skills/phone-layout-no-sideways-scroll.md`, the
  lesson and the procedure.
- CHANGELOG.

## Scope boundaries

- Three kinds of box are meant to scroll sideways, and the sweep leaves them alone:
  code blocks, tables inside `.table-scroll`, and rows of chips and tabs.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
