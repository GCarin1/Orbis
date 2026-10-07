# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The web app shall let the user attach files to a message with the clip button, by pasting (a screenshot) or by dropping them on the message box, show each as a chip with its thumbnail or name and size that can be taken out, and send the files alone or with text.
append-requirement ubiquitous: The web app shall show a message's images in place (opened large on a tap), play its audio and video, show every other file as a card with its extension and size that downloads it, and list a conversation's files from the bot's ⋮ menu and from a group's info and menu.
append-requirement unwanted: The web app shall not attach a file over 25 MB or more than 10 files to one message; it shall say which file and the limit.
append-criterion [verified] The clip adds files shown as chips, one can be taken out, files alone are sent and the box empties; a pasted screenshot gets a name and a dropped file is added; a file over 25 MB is refused with its name and the limit; a message shows its image (opened large and closed with Escape), its audio player and a card for its PDF, the token in each address; the conversation's files list its documents with who sent them and its images in a grid — verified by `packages/web/test/files.test.tsx`
```
