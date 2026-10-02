# Spec Delta — capability: computer

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/computer/spec.md`

---

```ops
bump-version minor
append-requirement state: While the hub runs on Windows, the system shall switch cmd.exe to UTF-8 before each `computer.shell` command, give commands of the bot's own computer the system variables Windows programs need and a profile of the bot's own (USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, TMP), and ask Python for UTF-8 output.
append-requirement unwanted: The system shall not read a binary file or a file over 10 MiB with `computer.read_file`; it shall say what the file is and point to the shell.
append-requirement event: When a file tool is given a path that does not exist, the system shall say so with the path the bot gave and point to `computer.list_files`.
append-requirement ubiquitous: The system shall let `browser.snapshot` read a page's text from an offset, and say at the end of each part where the next part starts.
append-criterion [verified] On win32 a command gets SystemRoot, ProgramFiles, a profile under the bot's home and PYTHONIOENCODING, and cmd.exe runs `chcp 65001` first; a missing file, a binary file, a file over 10 MiB, a missing folder and a file given as a folder each get a plain answer; a 12,003-character page reads in two parts — verified by `packages/hub/test/audit-cycle3.test.ts`.
```
