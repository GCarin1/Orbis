# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The web app shall not show file paths, environment variables, token counts or protocol names in its everyday screens: the sign-in asks for the access code, MCP is called Integrations, and each screen opens with one sentence.
append-criterion [verified] The sign-in asks for the access code, the hiring estimate speaks without tokens, and the Integrations screen is reached by that name — verified by `packages/web/test/account.test.tsx`, `packages/web/test/hiring.test.tsx`, `tests/e2e/marketplace.test.ts`
```
