# Tasks — Change 0046-phone-layout-no-sideways-scroll

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0046-phone-layout-no-sideways-scroll` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Reproduce the reported overflow at 390 px and find its cause (brain select inside a fieldset).
- [x] Fix it for every screen in `styles.css`; sweep every screen, panel and dialog and fix the new-bot grid and the two tables.
- [x] Keep the sweep as `tests/e2e/phone-layout.test.ts`.
- [x] Write the skill `phone-layout-no-sideways-scroll`, and the CHANGELOG entry.
