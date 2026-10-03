# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

---

```ops
bump-version minor
append-requirement event: When the signed-in web app asks for a pairing code, the hub shall make a six-digit code that works once, for five minutes, replacing the one before, and answer it with whether the hub takes connections from the network and its addresses on this computer's network cards.
append-requirement event: When a phone sends a pairing code to `POST /api/v1/pairing/claim`, which needs no token, the hub shall answer the hub's token for the current code and use the code up, and otherwise answer `invalid_code`.
append-requirement unwanted: The hub shall not accept a pairing code after its fifth wrong try, nor more than 20 pairing claims a minute from anywhere.
append-criterion [verified] A code works once, for five minutes, dies after five wrong tries and when cancelled; claims past 20 a minute are refused; the hub knows when it listens on the network and its addresses; the claim route alone takes no token — verified by `packages/hub/test/pairing.test.ts`.
append-criterion [verified] In a real browser, Settings → Phone makes a code, says how long it works and that the hub listens on this computer only, and the code is traded for the token once — verified by `tests/e2e/phone-pairing.test.ts`.
```
