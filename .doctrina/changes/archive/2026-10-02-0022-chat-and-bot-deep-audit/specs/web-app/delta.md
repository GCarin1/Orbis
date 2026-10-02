# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall render messages as Markdown — headings, lists, quotes, code blocks with a copy button, tables, links opening in a new tab, bold, italic and strikethrough — as elements, never as HTML, with mentions in each bot's color.
append-requirement ubiquitous: The web app shall show one working bubble per busy bot in a conversation, with the number of its runs waiting behind it, a stop button that cancels them, and "waiting for you" instead of typing dots while the bot waits for the user.
append-requirement event: When a run fails, the web app shall offer to try it again on its failure line, once.
append-requirement event: When the user scrolls up in a conversation, the web app shall keep its place as messages arrive and offer a button to the newest; when older messages exist, a button loads the previous page.
append-requirement unwanted: The web app shall not clear a message that could not be sent; it shall say why under the composer, and it shall not send on the Enter that confirms an accent or an input-method candidate.
append-criterion [verified] Markdown lists, code, tables, links and mentions render and raw HTML stays text; one bubble per bot with "+1 queued" and a stop that cancels both runs; the waiting note; Try again posts the retry once; earlier messages load on request; a failed send keeps the text and says why; a composing Enter does not send — verified by `packages/web/test/chat-audit.test.tsx`.
```
