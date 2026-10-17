# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
append-requirement event: When the user sends a PDF, the system shall read it once — its text (OCR for scanned pages), each of its first 20 pages as an image, a page bigger than A3 also cut into tiles with its lettering read by OCR — and before a bot starts on the message put that next to the PDF in the bot's workspace and tell the bot what is there, with the text as untrusted content; `files.get` gives the same reading, and brains that see also get the pages as images.
append-requirement unwanted: The system shall not leave a bot to take a PDF apart by itself without saying why: a hub without the PDF tools tells the bot it could not read inside the PDF.
append-criterion [verified] An A0 sheet sent by the user is read once into its text, its page image and 15 tiles, placed next to the PDF in the bot's workspace and described in its task with the text; a brain that sees gets the page; `files.get` gives the same reading; a hub without poppler says so — verified by `packages/hub/test/documents.test.ts`
```
