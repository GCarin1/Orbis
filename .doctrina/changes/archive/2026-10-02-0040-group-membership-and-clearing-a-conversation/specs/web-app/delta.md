# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall show a group's joins and leaves with the bot's face, let the user add a bot from the group's header, remove a member from its chip, clear a group or a direct conversation and delete a group, each after a confirmation, and follow a deleted bot out of its groups.
append-criterion [verified] In a browser, a group shows its two joins with faces; a bot added from the header and one removed from its chip are said to join and leave and the member count follows; a deleted bot is said to leave and the last bot cannot be removed; clearing empties the conversation and deleting the group closes it — verified by `tests/e2e/groups.test.ts`.
```
