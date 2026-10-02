# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
bump-version minor
append-requirement event: When `Orbis.bat` runs on Windows for the first time, the launcher shall create the Orbis shortcut with the Orbis icon on the Desktop and in the Start menu, say that the shortcut replaces the .bat, and keep a note so the shortcut does not come back after the owner deletes it, unless given `--atalhos` (make it again) or `--sem-atalhos` (never).
append-requirement unwanted: The launcher shall not stop or fail because the shortcuts could not be made; it shall say so and point to `Orbis-Atalhos.bat`.
append-criterion [verified] The shortcuts are made on the first run only, again with `--atalhos`, never with `--sem-atalhos`, with no note left when PowerShell made none, and nothing is done off Windows — verified by `packages/cli/test/windows-launcher.test.ts`.
```
