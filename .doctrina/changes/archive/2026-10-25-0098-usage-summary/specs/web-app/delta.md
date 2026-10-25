# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall open the Usage screen with three headline numbers — the month's cost, its runs and the bot that spent the most — write money in the user's own format, keep tokens a tap away, and offer to set a limit where a bot has none.
append-criterion [verified] Usage shows the cost, runs and top spender on top, "US$ 1.234,50" in Portuguese, tokens only after Show tokens, no Subscription column when nothing was billed, and Set a limit opens the bot — verified by `packages/web/test/secrets-usage.test.tsx`
```
