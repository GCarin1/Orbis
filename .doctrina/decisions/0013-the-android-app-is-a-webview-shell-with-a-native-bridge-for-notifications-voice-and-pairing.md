# ADR 0013 — The Android app is a WebView shell with a native bridge for notifications, voice and pairing

- **Status:** accepted
- **Scope:** android-app, web-app, hub-api
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "rode uma auditoria e procure por funcionalidades faltantes"), Claude Code
- **Supersedes:** 0012
- **Superseded by:** —
- **Evidence:** `packages/android/app/src/main/java/app/orbis/android/MainActivity.java`, `packages/android/app/src/main/java/app/orbis/android/KeepAliveService.java`, `packages/hub/src/api/pairing-routes.ts`, `packages/web/src/phone.ts`
- **Landed:** 2026-10-03 — `packages/android/app/src/main/java/app/orbis/android/MainActivity.java`, `packages/hub/src/api/pairing-routes.ts`

## Context

ADR 0012 made the Android app a WebView shell around the web app the hub
serves, with a bridge for connecting, the hub's address, the version, changing
the hub and saving files — and accepted no notifications and no microphone. An
audit of the app found those to be its largest gaps for a chat app, with typing
the long token on a phone to sign in.

## Decision

The app stays a WebView shell showing the hub's web app (ADR 0012's core). Its
`orbisAndroid` bridge grows by what only the phone can do, each function
optional to the web app (which may be newer than the installed app):

- **Notifications** come from the page's own live connection to the hub: the
  web app maps events to notifications and hands them to the app while it is
  off screen. To keep that connection alive in the background, the user may
  turn on a foreground service (type `specialUse`) with a lasting notification.
  No push service (Firebase) and no second connection.
- **Voice** goes through the phone's speech recognizer (its own screen) and
  text-to-speech, not the page's microphone.
- **Pairing**: the hub trades a six-digit code, made by the signed-in web app,
  for its token once (`POST /api/v1/pairing/claim`, the one `/api` route
  without the token: five minutes, one use, five tries, 20 claims a minute).
- Connecting and reading the clipboard answer the connect screen only.

## Alternatives considered

1. Firebase Cloud Messaging — rejected: a self-hosted hub would need a Google
   project and server key, and messages would leave the user's network.
2. A native connection in a service (the app's own WebSocket client) — rejected
   for now: a second client of the stream to keep in step with the web app.
3. A QR code scanned by the app — rejected for now: a camera library and the
   camera permission, where a six-digit code does the job.

## Consequences

**Positive**

- The phone tells the user when a bot replies or needs them, and signing in
  takes a short code; one UI codebase still.

**Negative**

- Without the foreground service, notifications stop once Android stops the
  backgrounded app; with it, a lasting notification and some battery.
- The pairing claim is a public route; its limits make guessing a code
  impractical, and a code is useless after five minutes or one use.
