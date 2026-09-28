# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall show, at the top of the brains settings, a ChatGPT card in three steps — install the Codex CLI, sign in with the ChatGPT account (in the browser, or with the one-time code shown large and the page to open), use it in a bot with a test — and the account once connected.
append-criterion [verified] The ChatGPT card installs Codex, starts a sign-in with a code, shows the code and the OpenAI page, shows the connected account after it polls, and tests the ChatGPT brain — verified by `packages/web/test/chatgpt.test.tsx`.
append-criterion [verified] In a real browser with fake `npm` and `codex`, the user installs Codex from Settings, signs in with a code shown on the card, and sees the connected ChatGPT account — verified by `tests/e2e/chatgpt.test.ts`.
```
