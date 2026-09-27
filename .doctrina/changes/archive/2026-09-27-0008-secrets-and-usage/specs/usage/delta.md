# Spec Delta — capability: usage

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/usage/spec.md`

---

```ops
set-header Implementation: verified — usage report and spend-cap hooks (`packages/hub/src/usage/`), price table with `<data>/prices.json` overrides
bump-version minor
append-requirement event: When the data directory holds `prices.json`, the system shall apply its per-model prices over the shipped table, so local and third-party models can be priced.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
append-criterion [verified] API usage is priced from the shipped table, a model with no price costs zero, and `prices.json` adds and overrides prices — verified by `packages/hub/test/usage.test.ts`.
```
