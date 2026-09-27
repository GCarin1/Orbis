# Spec Delta — capability: approvals

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/approvals/spec.md`

---

```ops
set-header Implementation: verified
bump-version minor
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
append-requirement ubiquitous: The system shall deliver a draft whose channel is `webhook` as an HTTP POST of its fields to its URL, and append every other draft to the `outbox.jsonl` file of the data directory.
append-requirement event: When Claude Code asks permission for one of its built-in tools, the system shall decide it as the Orbis tool with the same effect — Bash as `computer.shell`; Write, Edit, MultiEdit and NotebookEdit as `computer.write_file`; Read, Glob, Grep and LS as `computer.read_file`; WebFetch and WebSearch as `http.fetch` — and allow every other built-in tool.
append-requirement event: When a run ends while one of its approvals is pending, the system shall mark the approval `expired` and its card `expired`.
```
