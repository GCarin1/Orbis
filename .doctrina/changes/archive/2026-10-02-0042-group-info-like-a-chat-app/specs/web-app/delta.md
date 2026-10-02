# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 8: The web app shall list group conversations in the same list as the bots, provide a dialog that creates a group of 2 bots up to the hub's group limit with a lead, and show in a group's header its photo (or its members' faces), its name and its members, or who among them is working.
replace-requirement ubiquitous 32: The web app shall show a group's joins, leaves and info changes in its timeline (joins, leaves and a new lead with the bot's face), and offer in the group's ⋮ menu adding members, its info, its links, search, muting, and under More exporting the conversation as text, clearing it and deleting the group, each destructive one after a confirmation, and follow a deleted bot out of its groups.
append-requirement event: When the user clicks a group's photo or name, the web app shall open the group's info beside the conversation (full screen on a phone) with its photo, name and description to change, buttons to add, search, mute and export, its links, its members with their role, state and lead badge (each offering a direct conversation, making it lead and removing it), its notifications, and clearing and deleting it.
append-requirement event: When the user opens Add members, the web app shall list the visible bots outside the group with a search field, allow picking as many as the group's limit leaves room for, and say when every bot is already in the group (offering a new bot) or the group holds its limit (naming ORBIS_MAX_GROUP_SIZE).
append-requirement event: When the user picks a search result or a link's line in the group's info, the web app shall load the conversation back to that message, scroll to it and mark it for a moment.
replace-requirement optional 1: Where the brain is OpenAI-compatible, the web app may offer how to send the key (Authorization Bearer or an `api-key` header) and say that `{model}` in the address is replaced by the model.
append-requirement state: While a group is muted, the web app shall show a muted mark beside its name in the header and the list, and a gray unread dot.
append-criterion [verified] The header shows the photo, the members or who works and opens the info; the ⋮ menu lists every option with the rarer ones under More; Add members picks outsiders up to the limit and says when all are in or the group is full; the info changes the photo, description and name, makes a member lead, removes it, opens its conversation, mutes and deletes; search marks the words and shows the message; links show who wrote them; the timeline says the info changes in pt-BR; the export writes one line per message — verified by `packages/web/test/group-info.test.tsx`.
append-criterion [verified] In a real browser, a user adds a member from the ⋮ menu, opens the group's info on the right edge from its name, sets a description and a photo (shrunk to a JPEG and shown in the header and the list), mutes the group, removes a member from its row, finds a message by searching without accents and sees it marked, then clears and deletes the group from ⋮ → More — verified by `tests/e2e/groups.test.ts`.
```
