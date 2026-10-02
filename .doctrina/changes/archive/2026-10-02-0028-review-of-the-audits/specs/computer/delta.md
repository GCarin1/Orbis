# Spec Delta — capability: computer

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/computer/spec.md`

---

```ops
bump-version patch
append-requirement state: While the hub runs on Windows, the system shall pass a `computer.shell` command to cmd.exe verbatim inside one pair of quotes that `/s` strips, as Node's own shell option does, so the command's own quotes arrive as written.
append-requirement event: When `computer.read_file` reads a file that starts with a UTF-16 or UTF-8 byte-order mark, the system shall decode it as that text.
append-criterion [verified] `mkdir "Nova Pasta" && git commit -m "primeiro"` reaches cmd.exe as written; a UTF-16 file Windows PowerShell writes and a UTF-8 file with a BOM read as text, and a binary file is still refused — verified by `packages/hub/test/review.test.ts`.
```
