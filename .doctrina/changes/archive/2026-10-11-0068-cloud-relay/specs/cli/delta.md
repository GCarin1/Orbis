# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
append-requirement event: When the user runs `orbis link --cloud <url>`, the CLI shall set the Orbis cloud this device relays to (with the link, or at once when already linked; `default` for the published cloud), and `orbis link --status` shall show whether the relay to the cloud is connected.
append-criterion [verified] `orbis link --status` shows the cloud (none yet), `--cloud https://…` sets it on a linked hub and shows it disconnected, and a cloud address that is not https is refused — verified by `packages/cli/test/link.test.ts`
```
