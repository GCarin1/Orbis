---
name: close-after-a-failed-gate
description: Resume a `doctrina close` that stopped at a gate after its apply step, without applying the deltas twice
when: A `doctrina close <id>` run printed "close stopped at …" at step 5 or later (verify, coverage, docs, archive…)
---

# Skill — close-after-a-failed-gate

## When to use this skill

- `doctrina close <id>` stopped at `verify` (or any step after `apply`), so
  the spec deltas were already written into `.doctrina/specs/` and the
  proposal is stamped `Status: applied`.

## Procedure

1. Fix the cause the gate printed (for `verify`: run `npm run typecheck`,
   `npm test` or `npm run build` until clean).
2. Leave the specs as they are. Do not `git checkout` them: the proposal is
   still stamped `applied`, so the next close skips `apply` and the specs
   would stay at their old version.
3. Rerun `doctrina close <id>`. Step 4 prints `skip … already applied` and
   the close continues from the gates.
4. Check one touched spec's `**Version:**` went up by exactly one bump.

If the specs were reverted anyway: `doctrina index rebuild`, then
`doctrina change apply <id> --force` once (the tool's own guidance: only
after reverting to the pre-apply state), then `doctrina close <id>`.

## Anti-patterns

- Reverting the specs and rerunning close: apply is skipped, the specs keep
  their pre-change text while the change archives as applied.
- `change apply --force` without reverting first: the ops are additive, so
  every appended requirement and criterion appears twice and the version is
  bumped twice.

## Related material

- Change `0008-secrets-and-usage` (closed after a typecheck failure in a
  new web test).
