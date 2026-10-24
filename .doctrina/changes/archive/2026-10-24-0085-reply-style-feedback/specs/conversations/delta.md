# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version patch
append-requirement event: When the user switches a conversation's reply style or its backstage, the system shall post the change in the conversation, for the user to see and its bots to read.
append-requirement ubiquitous: The system shall end the task of every run in a conversation the user switched to short replies (but a handed-off task) with a reminder to answer in one to three short sentences, so a conversation of long answers turns short.
append-criterion [verified] A switch posts its event (none when nothing changes), and a run in a conversation switched to short replies ends its task with the reminder (not one short by default), never a handed-off one's — verified by `packages/hub/test/backstage.test.ts`
```
