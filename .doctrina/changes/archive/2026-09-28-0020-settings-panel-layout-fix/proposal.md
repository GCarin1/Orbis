# Change 0020-settings-panel-layout-fix — Settings panel layout fix

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** chore
- **Affects specs:** (none — chore)

## Why

Screenshots taken for the project owner showed the bot settings panel
broken: the `.settings-form` rules added for the voice settings (change
0016) also matched the bot settings form, which already carried that class,
so its checkboxes sat above their labels and the computer cards ran past
the panel's edge. The marketplace's bot checkboxes stacked the same way. No
automated test looks at layout.

## What

- `packages/web/src/styles.css`: the new forms use `prefs-form`; computer
  cards one per row in the settings panel; consent, bot and theme rows
  inline; links and buttons of cards aligned left; the language select sized.
- `VoiceSettings.tsx`, `Marketplace.tsx`: the `prefs-form` class.

## Scope boundaries

- No behaviour changes; styles and class names only.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The bot settings panel, the marketplace and the voice settings look right in light, dark and phone screenshots.

## Open questions

- None.
