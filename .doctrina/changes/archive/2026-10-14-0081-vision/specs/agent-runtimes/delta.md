# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

<!--
For ADDED: include the full new spec body below. On apply, the body is
written verbatim to the target path.

For MODIFIED: prefer a fenced `ops` block — on apply the CLI executes it
against the target spec, all ops or none (ADR 0007). The verbs cover
headers, acceptance criteria, AND the EARS requirement bullets, so a
typical delta applies mechanically end to end; only free-prose rewrites
(Purpose, Maturity, ...) stay a by-hand merge. A MODIFIED delta with no
`ops` block prints a manual-merge pointer.

  ```ops
  set-header Implementation: verified — durable adapter (`src/db.ts`)
  bump-version minor
  set-criterion 1: verified
  append-criterion [unverified] new signal — verified by `test/x.test.ts`
  append-requirement event: When <trigger>, the system shall <action>.
  replace-requirement ubiquitous 2: The system shall <action>.
  ```

Requirement sections: ubiquitous | event | state | unwanted | optional.
append-* ops resolve numbering/position at APPLY time, so several open
changes appending to the same spec never collide on numbers — order of
application decides.

For REMOVED: the body may be empty; on apply, the target spec file is
deleted and the capability is recorded in the change archive only.
-->

---

<!-- delta body below -->

```ops
bump-version minor
append-requirement event: When the user sends images (PNG, JPEG, GIF, WebP, up to 5 MB, at most 5) with a message, the system shall give them to the Anthropic brain as image blocks and to a remote OpenAI-compatible brain as data URLs, with the message of the moment and before its text; a local server's model (Ollama, LM Studio, a local base URL) and the CLI brains keep the files' paths in their task.
append-criterion [verified] A message's images reach the brains that see — a few, not too large, never another kind of file — as Anthropic image blocks and as OpenAI data URLs before the text, and a local model gets none — verified by `packages/hub/test/vision.test.ts`
```
