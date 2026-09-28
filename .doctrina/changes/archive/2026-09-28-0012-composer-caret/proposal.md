# Change 0012-composer-caret — composer-caret

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product (uncertain) — opened as chore
- **Affects specs:** (none — chore)

## Why

The fresh-clone test run found two end-to-end failures (collaboration and
skills-and-routines): after picking an `@mention` or `/skill` suggestion the
composer restored the caret in a later animation frame, so keys typed in
between were moved back and the message came out garbled.

## What

- `packages/web/src/components/Composer.tsx`: the caret position after a
  pick is applied in a layout effect, in the same commit as the new text,
  before the browser handles the next key.
- `packages/web/test/composer.test.tsx`: a regression test that types right
  after a pick and waits a frame; it fails on the old code (caret moved from
  10 back to 9) and passes on the fix.

## Scope boundaries

- Suggestions, their order and the inserted text are unchanged.
- No spec, contract or API change: the web-app spec already asks for
  working `@` and `/` autocomplete; this fixes a race in it.

## Verification

- [x] Automated checks pass (`doctrina verify`), including the end-to-end collaboration and skills-and-routines browser tests.
- [x] The new composer test fails on the previous code and passes on the fix.

## Open questions

- None.
