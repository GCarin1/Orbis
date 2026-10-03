# ADR 0014 — The Android app is a WebView shell with a native bridge for notifications, voice and pairing by code or QR code

- **Status:** accepted
- **Scope:** android-app, web-app, hub-api
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "quero que você inclua o QR Code, pois é muito mais simples do que simplesmente a pessoa digitar o HTTPS"), Claude Code
- **Supersedes:** 0013
- **Superseded by:** —
- **Evidence:** `packages/android/app/src/main/java/app/orbis/android/MainActivity.java`, `packages/android/app/src/main/java/app/orbis/android/Hub.java`, `packages/web/src/components/QrCode.tsx`, `packages/web/src/components/TokenGate.tsx`
- **Landed:** —

## Context

ADR 0013 kept the Android app a WebView shell around the hub's web app. Its
bridge covers notifications, voice and pairing with a six-digit code. That ADR
rejected a QR code for then: it needed a camera library and the camera
permission. The owner now asks for the QR code, because typing the hub's
address on a phone is the hard part, and the code does not spare that.

## Decision

Everything ADR 0013 decided stands. The app stays a WebView shell. Its
optional bridge functions remain: notifications from the page's own
connection, with the opt-in foreground service; the phone's recognizer and
voice; pairing with a code through `POST /api/v1/pairing/claim`; connecting
and the clipboard only from the connect screen. This ADR adds the QR code:

- **The link.** The computer's QR code holds a link,
  `<address>#pair=<code>`. The address is one the phone can reach: the
  page's own address when it is not this computer's, or one of the hub's
  network cards, which the user picks. The code is the one-time pairing code,
  never the token.
- **In the app.** The connect screen's **Scan QR code** uses Google Play's
  code scanner (`play-services-code-scanner`). It shows its own camera screen,
  so the app asks for no camera permission and holds no camera code. The app
  then trades the link's code for the token, as a typed code. A link shared to
  the app works the same way.
- **In a browser.** The phone's own camera opens the link in the browser. The
  web app trades the code from the fragment, saves the token and removes the
  code from the address bar. Six digits typed where the token goes are traded
  the same way.
- **The QR library.** The web app draws the QR code with `uqr` (MIT, no
  dependencies) as one SVG path.

## Alternatives considered

1. A camera and a decoder inside the app (CameraX with ZXing or ML Kit
   bundled) — rejected: it needs the camera permission and code to maintain,
   where Google Play's scanner does the same with neither.
2. The token in the QR code — rejected: anyone who sees the screen would get
   lasting access. A pairing code works once, for five minutes.
3. A custom scheme (`orbis://…`) opened by the phone's camera — rejected:
   camera apps open web links, not every one opens a custom scheme; the
   `http(s)` link also works with no app.

## Consequences

**Positive**

- Connecting a phone takes one scan: no address and no code to type.
- The same QR code works with or without the app.

**Negative**

- The scanner needs Google Play services. A phone without them gets a message
  and types the address and code instead.
- The app now depends on AndroidX through Google Play's libraries, and the
  APK is larger: about 1.4 MB.
