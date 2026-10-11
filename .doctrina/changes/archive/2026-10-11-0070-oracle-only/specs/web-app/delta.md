# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
replace-requirement event 34: When the account has an authenticator set up, signing in shall ask its 6-digit code after the password and open the app only with the session it proves; Settings → Account shall set one up from a QR code (or its key) and have the hub require it, and turn it off (change 0070).
replace-criterion 65: [verified] Signing in with an authenticator asks its code after the password, says a wrong code, and signs in with the second-step session; without one the password suffices; Settings → Account sets it up from a QR code, has the hub require it and turns it off — verified by `packages/web/test/mfa.test.tsx`
```
