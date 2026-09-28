# Spec Delta — capability: templates

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/templates/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The system shall not export nor import access to the user's own machine: a `host` computer leaves a template, and enters a bot, as the hub's default computer.
append-criterion [verified] A bot on the user's own machine exports with no `host` access, and a template that names it imports a bot on the default computer — verified by `packages/hub/test/computer/host.test.ts`.
```
