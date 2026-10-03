# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall show in Settings → Phone, beside a pairing code, a QR code that holds the link `<address>#pair=<code>`, for an address the phone can reach: the page's own address when it is not this computer's, or the hub's network card the user picks.
append-requirement event: When the web app opens with `#pair=<code>` in its address, or the user types six digits where the token goes, the web app shall trade the code for the hub's token, save the token and remove the code from the address bar, or say that the code is wrong, used or expired.
append-criterion [verified] The QR code holds the address picked and the code, and decoding its image gives back exactly that link; the page's own address comes first when it is not this computer's; the sign-in screen trades a QR code's code once and six typed digits, and says when a code is refused — verified by `packages/web/test/android.test.tsx`.
append-criterion [verified] In a real browser, Settings → Phone shows the QR code, its link opens the web app on a phone signed in with the code gone from the address bar, the same link again is refused, and six digits typed on the sign-in screen sign in — verified by `tests/e2e/phone-pairing.test.ts`.
```
