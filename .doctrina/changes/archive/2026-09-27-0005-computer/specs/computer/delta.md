# Spec Delta — capability: computer

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/computer/spec.md`

---

```ops
set-header Implementation: verified — local and docker providers (`packages/hub/src/computer/`), browser tools on Playwright, hibernation, takeover, the live view and the `orbis/desktop` image (`docker/desktop/`)
bump-version minor
replace-requirement ubiquitous 4: The system shall execute `computer.shell` with the bot's workspace as working directory, a timeout (default 120 seconds) that kills the command's whole process group, an output cap of 64 KiB, and an environment made only of PATH and LANG from the hub, TERM, and HOME set to the bot's own home directory.
append-requirement ubiquitous: The system shall serve a docker computer's noVNC view only through the hub, to requests that carry the API token or the bot's view cookie, which is scoped to that bot's view path.
append-requirement event: When the output of `computer.shell` is longer than the tool result allows, the system shall return its start and its end, say how much was left out, and suggest redirecting it to a file.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
set-criterion 5: verified
set-criterion 6: verified
set-criterion 7: verified
append-criterion [verified] Password, CAPTCHA and verification-code pages answer with a request to ask the user for a takeover, and typing into a password field is refused — verified by `packages/hub/test/computer/browser.test.ts`.
append-criterion [verified] The noVNC pages and WebSocket answer only with the bot's own view cookie, and a local computer has no desktop to show — verified by `packages/hub/test/computer/docker.test.ts`.
```
