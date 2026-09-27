# Spec Delta — capability: templates

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/templates/spec.md`

---

```ops
set-header Implementation: verified — template export, secret scan and import (`packages/hub/src/templates/`)
bump-version minor
append-requirement unwanted: The system shall not report a `{{secret:NAME}}` placeholder as a credential finding, and shall not include the matched text in a finding.
append-requirement event: When an imported template holds an invalid skill, brain or routine, the system shall reject it naming the field and create nothing.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
append-criterion [verified] A template with another `apiVersion` or `kind` is rejected naming the field, and one with an invalid skill creates no bot — verified by `packages/hub/test/templates.test.ts`.
```
