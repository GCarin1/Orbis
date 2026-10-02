# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall keep for each group a description, a photo (a small `data:` image URL, or none) and a mute switch, changed with its name and lead through the group's update, and shall give the group's bots its description in their context there.
append-requirement event: When a group's name, description, photo or lead changes, the system shall post an event saying so (`group.renamed`, `group.described`, `group.photo`, `group.lead`), which the bots' history leaves out.
append-requirement event: When the user searches a conversation, the system shall return its messages that hold the words ignoring case and accents, newest first, and when the user asks for its links, each http(s) address written in its messages once, newest first, with who wrote it.
append-requirement unwanted: The system shall not accept as a group's photo anything but a PNG, JPEG, WebP or GIF image as a `data:` URL, nor change a direct conversation's group info.
append-criterion [verified] A group's name, description, photo, lead and mute change and each visible change is said in the group; the same values again and the mute say nothing; a non-image photo and a direct conversation are refused; the description reaches the bots' context and the info events stay out of their history; search ignores case and accents, newest first; links come once each, newest first — verified by `packages/hub/test/group-info.test.ts`.
```
