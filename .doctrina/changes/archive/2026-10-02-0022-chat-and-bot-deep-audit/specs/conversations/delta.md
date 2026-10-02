# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall tell each run where it takes place: the bot's own conversation, a colleague's conversation it was brought into, or a group with its title, its other members and whether the bot leads it.
append-requirement event: When the user asks to try a failed or cancelled run again, the system shall start a new run of the same bot in the same conversation with the same task and skill, recording the run it retries, and point a handoff card at the new run.
append-requirement unwanted: The system shall not try again a run that is queued, running, waiting or done; it shall answer 409.
append-criterion [verified] A group run is told the group's title, the other members and that the bot leads it, and a direct run that it is the bot's own conversation; a run that failed for a missing key is tried again after the brain is fixed and replies, and trying a done run again answers 409 — verified by `packages/hub/test/chat-audit.test.ts`.
```
