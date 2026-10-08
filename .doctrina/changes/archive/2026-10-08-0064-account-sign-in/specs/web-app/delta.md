# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-08
bump-version minor
append-requirement ubiquitous: The web app shall open the event stream with a one-time ticket and show files with the hub's file key, renewed every 20 minutes and when the stream reconnects, never putting the token or a session in an address.
append-requirement ubiquitous: The web app shall keep an Orbis account's session on the device and renew it a minute before it ends, once for every request waiting, ending it when its renewal is refused; the hub's token, when the device has one, comes first.
append-requirement event: When the hub has an account linked, the sign-in screen shall ask first for that account's email and password, offer to email a reset link that comes back to the page, and still offer the token or a pairing code.
append-requirement event: When an email's reset link opens the page, the web app shall take its session out of the address and ask for a new password of at least 10 characters, typed twice.
append-requirement event: When the user, signed in with the hub's token, signs in to their account or creates it in Settings → Account, the web app shall offer to link this hub to it, and show the account linked, how this device signed in, signing out and unlinking.
append-criterion [verified] The client signs in with the publishable key, refuses a short password before asking, renews a session once for many requests and ends it when refused, and takes an email link's session or error out of the address; the sign-in screen signs in with the linked account, says a wrong password, emails a reset link back to the page, saves a new password and still offers the token; Settings → Account signs in, links, unlinks and creates an account that must be confirmed — verified by `packages/web/test/account.test.tsx`
```
