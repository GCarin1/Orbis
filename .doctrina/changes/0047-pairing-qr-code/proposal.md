# Change 0047-pairing-qr-code — pairing qr code

- **Status:** proposed
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** android-app, web-app
- **Documented surface:** n/a — documented in docs/android.md with this change; the routes are those of change 0044

## Why

The owner asked for the QR code that change 0044 left out. Typing the hub's
address on a phone is harder than scanning it.

## What

- Web:
  - Settings → Phone shows a QR code (`QrCode.tsx`, drawn with `uqr` as one
    SVG path). It holds `<address>#pair=<code>`.
  - The address is the page's own when that is not this computer's,
    otherwise a network card the user picks.
  - The sign-in screen (`TokenGate.tsx`) trades a `#pair=` code from the
    address, and six typed digits.
- Android:
  - **Scan QR code** on the connect screen uses Google Play's code scanner,
    with no camera permission. This adds the
    `play-services-code-scanner` dependency and AndroidX.
  - `Hub.pairCode` and `Hub.pairLink` read the link. A shared pairing link
    connects.
- ADR 0014 supersedes ADR 0013 (which had rejected the QR code).
- Tests: `HubTest.java`, `android.test.tsx` (decodes the QR image with
  `jsQR`), `android-connect.test.ts`, `phone-pairing.test.ts`.
- Docs: `docs/android.md`, CHANGELOG.

## Scope boundaries

- The token never goes in a QR code, only the one-time pairing code.
- The launcher's terminal prints no QR code: the web app shows it.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`, and `gradle -p packages/android testReleaseUnitTest lintRelease assembleRelease` (0 lint issues).
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
