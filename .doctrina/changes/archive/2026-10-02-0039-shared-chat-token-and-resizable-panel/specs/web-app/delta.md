# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall show in Settings → Brains, for each chat API that `chat-http` bots use, its token's status and its bots, and take a new token or cURL that applies to all of them; a bot's settings and the new-bot screen shall save the token as its API's.
append-requirement ubiquitous: The web app shall let the user change the side panel's width by dragging its left edge or with the arrow keys, keep it within the window, remember it in the browser, and show a wide bot settings panel in two columns.
append-criterion [verified] The tokens card changes the token of an API's two bots from a pasted cURL, refuses a cURL of another API and text with no token, and hides with no chat API; a new bot of an API with a token needs none typed; a bot's settings ask for the address first and say when a bot uses its own token from before; the panel's width follows the keys and a drag within its limits, is remembered and is reset by a double-click — verified by `packages/web/test/chat-http.test.tsx`.
```
