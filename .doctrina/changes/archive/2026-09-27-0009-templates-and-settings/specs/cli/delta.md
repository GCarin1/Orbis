# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
set-header Implementation: verified — every command group listed above, `bots export|import` included
bump-version minor
append-criterion [verified] `orbis bots export` writes a template (to stdout or `--out`), `orbis bots import` creates a new bot from a file or stdin, and an export holding a GitHub token fails naming its line — verified by `packages/cli/test/templates.test.ts`.
```
