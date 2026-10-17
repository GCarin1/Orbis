# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

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
append-requirement ubiquitous: The system shall keep, for each conversation, how its bots answer the user — `chat` (one to three short sentences, warm and plain, no headings or lists unless asked) or `detailed` — and whether the team's work stays backstage; a conversation with no choice of its own follows the hub's default (chat, backstage), conversations made before keep detailed and in the chat, and a handed-off task is always worked in full.
append-requirement event: When the team's work stays backstage, the system shall mark as backstage the handoff cards, the answers of the bots the work was handed to (and their failures), and the words of a bot that handed work out and waits for the answers; the user's message, the final answer (the report), approvals, secret requests and files stay in the chat, and backstage items move neither the list of chats nor its last message.
append-criterion [verified] A conversation follows the hub's default until it or the default changes; the bot answering the user is told to keep it short and a handed-off task never is; with the backstage on, the cards, the colleagues' answers and the lead's waiting words are backstage and the chat shows the question and the report, the list of chats never showing the work; with it off, everything shows — verified by `packages/hub/test/backstage.test.ts`
```
