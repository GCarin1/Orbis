# ADR 0012 — The Android app is a WebView shell that shows the hub's web app

- **Status:** accepted
- **Scope:** android-app, web-app
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "um build .apk do app e um Actions que gere o APK da versão atual"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/android/app/src/main/java/app/orbis/android/MainActivity.java`, `.github/workflows/android.yml`
- **Landed:** —

## Context

The owner wants Orbis on the phone as an APK, built by a GitHub Actions
workflow from the current version. The bots, their computers, brains and
secrets live on the user's computer, with the hub; a phone cannot run them.
ADR 0007 already made one web app for browser and desktop, served by the hub,
and a PWA for phones — but a PWA needs a secure origin, and a hub on the local
network is plain http, so a phone's browser does not install it.

## Decision

The Android app is a small native shell in Java (`packages/android`): one
`WebView` that loads the web app the user's hub serves, at an address the user
types on a first screen bundled in the APK. It adds what a browser tab lacks:
the file picker, saving exports to Downloads, the Back button, external links
in the phone's browser, an adaptive icon. It talks to the page through one
`orbisAndroid` bridge (connect, hub address, version, change hub, save a text
file) and nothing else. Its version is Orbis's version; the APK is built by a
workflow with Gradle, signed with a key from the repository's secrets when
there is one, else with a debug key.

## Alternatives considered

1. Capacitor (the web app bundled inside the APK) — rejected: the phone would
   run its own copy of the web app, out of step with the hub it talks to, and
   every web change would need a new APK; the API would also need cross-origin
   access.
2. React Native or a native UI — rejected: a second front-end to keep in sync
   (as ADR 0007 rejected for the desktop).
3. Only the PWA — rejected: it cannot be installed from a plain-http hub, and
   the owner asked for an APK.

## Consequences

**Positive**

- One UI codebase still; every web feature reaches the phone with no new APK.
- A tiny APK (about 130 KB) with no dependencies but the Android SDK.

**Negative**

- The phone must reach the computer (same Wi-Fi, or a VPN), and the hub must
  listen on the network (`ORBIS_HOST=0.0.0.0`, `Orbis-Celular.bat`).
- Over plain http the page is not a secure origin: no microphone or
  notifications in the app for now.
- Without the signing secrets each APK has its own debug key, so an update
  needs the old app uninstalled.
