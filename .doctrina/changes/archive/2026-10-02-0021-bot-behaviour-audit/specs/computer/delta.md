# Spec Delta — capability: computer

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/computer/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall tell each bot the operating system of its computer and the shell `computer.shell` runs (cmd.exe on Windows), and to prefer the file tools for reading and writing files.
append-requirement event: When the browser of a bot's computer cannot start because Playwright's Chromium is not downloaded, the system shall start the Google Chrome or Microsoft Edge installed on the machine, and when neither is installed, fail naming what to install.
append-criterion [verified] The context names Windows and cmd.exe on win32 and Linux and /bin/sh on linux; the browser launch falls back from the bundled Chromium to Chrome and Edge, and fails asking to install one — verified by `packages/hub/test/bot-behaviour.test.ts`.
```
