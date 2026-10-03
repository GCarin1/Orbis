---
name: phone-layout-no-sideways-scroll
description: Keep every web app screen, panel and dialog inside a 390 px phone, and prove it with the phone-layout sweep
when: A change adds or edits a screen, panel, dialog, form, fieldset, select, table or grid in packages/web, or a report says the app scrolls sideways on a phone
---

# Skill — phone-layout-no-sideways-scroll

## When to use this skill

- A change in `packages/web/src/components/` adds or edits a screen, a
  panel, a dialog, a `<fieldset>`, a `<select>`, a `<table>` or a CSS grid.
- Someone reports a screen that moves sideways on a phone (the Android app
  or a phone browser).

## Procedure

1. Run the sweep at 390 px before and after the change:
   `ORBIS_BROWSER_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) npx vitest run --project e2e tests/e2e/phone-layout.test.ts`.
   Each failure names the box that scrolls and its widest child, which is
   usually the cause.
2. A new screen, tab or dialog gets a step in that sweep, so the next
   change is checked too.
3. Fix the cause, never the symptom:
   - A `<fieldset>` is at least as wide as its content
     (`min-inline-size: min-content`). `styles.css` resets it to 0 for
     every fieldset. Keep that reset.
   - A `<select>` is as wide as its longest option. `styles.css` sets
     `max-width: 100%` on inputs, selects and textareas. Keep that too.
   - Grid tracks use `minmax(0, 1fr)`, not `1fr`. A plain `1fr` track
     cannot shrink below its content. On phones, a form grid becomes one
     column (`@media (max-width: 760px)`).
   - A wide table goes inside `<div className="table-scroll">`. The table
     then scrolls on its own, and the screen around it stays in place.
4. Run `npx vitest run --project web` and `npm run build`.

## Anti-patterns

- `overflow-x: hidden` on the screen. It hides the overflow and the
  controls past the edge: in the bot settings it cuts off the end of the
  brain select.
- `overflow-x: auto` on a whole screen body for one table. The screen,
  its headings and its buttons then all scroll sideways together
  (Settings → Brains and Usage did this).
- Checking only the screen that was reported. The sweep that found the
  bot settings bug (the brain fieldset at 586 px) also found two others:
  the new-bot form at 509 px and the brains and usage tables.

## Related material

- `tests/e2e/phone-layout.test.ts`: the sweep at 390 px.
- `packages/web/src/styles.css`: the fieldset, select and `.table-scroll`
  rules.
- Spec `web-app`, change `0046-phone-layout-no-sideways-scroll`.
