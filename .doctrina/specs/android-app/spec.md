# Spec — android-app

**Capability:** android-app
**Status:** active
**Implementation:** verified — Java WebView shell in `packages/android` (connect screen with pairing by code or QR code, hub-only navigation, file picker, Downloads, Back, notifications, keep-connected service, dictation, voice, share); APK built by `.github/workflows/android.yml`
**Realizes:** SC7
**Depends on:** web-app, hub-api
**Last updated:** 2026-10-03
**Version:** 0.3.0

## Purpose

The phone mode: an Android app (an APK) that shows the same web app on the
phone. Bots, their computers and their brains stay on the user's computer: the
app opens the web app the user's hub serves over the network, so the phone
always runs the hub's own version and needs no update when the hub changes. A
GitHub Actions workflow builds the APK of the current version on demand.

## Requirements (EARS)

### Ubiquitous

- The Android app shall show in a WebView the web app served by the hub at the address the user gave, with JavaScript and the page's storage on and file access off.
- The Android app shall expose to the page only connecting to a hub (from its connect screen alone), reading the clipboard (from its connect screen alone), reading a QR code with Google Play's code scanner (from its connect screen alone), the hub's address, the app's version, changing the hub, saving a text file to Downloads, showing a notification, the notification permission, keeping connected in the background, the battery settings, the phone's dictation and the phone's voice.
- The Android app shall take its version name from Orbis's version (the root `package.json`) and its version code from the build number.
- The web app shall, inside the Android app, save the files it exports (a conversation, a bot template) through the app, show the hub and the app's version in Settings with a button to change the hub, and tell the app what the phone's Back button closes first.

### Event-driven

- When the app starts with no saved hub, or the hub's page fails to load, the Android app shall show its connect screen with the hub's address, why it failed and how to let the computer's Orbis take connections from the network.
- When the user types an address, the Android app shall take a bare host as `http://<host>:7420/`, keep an explicit port and path, hand a `#token=…` fragment to the web app, save the hub and open it.
- When the page asks for a file, the Android app shall open the phone's file picker and give the page what was picked.
- When the user presses Back, the Android app shall let the web app close what is open first (a dialog, a panel, a conversation), and otherwise go back or move to the background, keeping the page.
- When the Android APK workflow runs by hand, on a `v*` tag or on a push that changes the app, it shall run the app's unit tests and lint, build a release APK named with the version and build number, attach it to the run, and publish it in a GitHub release when run by hand with release on or on a tag.
- When the Windows launcher is started with `--celular` (or `Orbis-Celular.bat`), it shall start the hub listening on the network and print the address and sign-in link of each network card for the phone.
- When the web app reports, while the app is off screen, a bot's message, an approval or a secret request, or a manager's report, the Android app shall show a notification — one per conversation, the latest replacing the one before — whose tap opens that conversation, and shall show none for a muted group's messages and reports.
- When the user turns on staying connected, the Android app shall run a foreground service with a lasting notification that keeps the page's connection alive in the background, until the user turns it off or removes the app from the recent apps.
- When the user gives a pairing code with the address, or scans the computer's QR code (a link `<address>#pair=<code>`), the Android app shall trade the code for the hub's token through `POST /api/v1/pairing/claim` and sign in with it, or say why it was refused.
- When another app shares text with Orbis, the Android app shall connect if the text holds a sign-in link (`…#token=…`) or a pairing link (`…#pair=…`), and otherwise hand the text to the web app, which puts it in the message box of the next conversation opened.
- When the page asks for dictation or to read a reply aloud, the Android app shall use the phone's speech recognizer and voice.
- When a hub's saved address does not answer, the connect screen shall try it again every 10 seconds until the user stops it, and offer the last five hubs and a link from the clipboard.

### Unwanted-behavior (must-not)

- The Android app shall not open a page of another origin than the saved hub inside the app; a link elsewhere opens in the phone's browser or app.
- The Android app shall not grant the page the camera or the microphone, nor let its saved hub, token or files leave the phone in a backup or a device transfer.
- The APK workflow shall not need a signing key to build: without the `ANDROID_KEYSTORE_*` secrets it signs with a debug key and says so.
- The Android app shall not load an https hub whose certificate the phone does not trust; its connect screen shall say why.
- The Android app shall not ask for the camera permission: the QR code is read on Google Play's own scanner screen, and a phone without it is told to type the address and the code.

## Acceptance criteria

1. [verified] A bare address becomes the hub on port 7420, a full one keeps its port and its `#token=…`, an https one keeps its own port, refused addresses say why, origins write the default port out, and saved files get safe names — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
2. [verified] In a real browser, the connect screen hands the typed address to the app, translates why one is refused in Portuguese and English, shows the saved hub, why it did not answer and the app's version, and points to `Orbis-Celular.bat` — verified by `tests/e2e/android-connect.test.ts`.
3. [verified] Inside the app, exported files go to the app and not to a browser download, Settings shows the hub and the version and changes the hub, the card is hidden in a browser, and the page answers the app's Back — verified by `packages/web/test/android.test.tsx`.
4. [verified] In a real browser, the page's Back handler takes a group's search back to its info — verified by `tests/e2e/groups.test.ts`.
5. [verified] The launcher takes `--celular`, knows when the hub listens on the network, and lists a link with the token for each IPv4 network card — verified by `packages/cli/test/windows-launcher.test.ts`.
6. [verified] The workflow builds, tests, lints and names the APK with the version and build number, signs with the release key from the secrets or with a debug key, and publishes the release on demand or on a tag — verified by `.github/workflows/android.yml`.
7. [verified] A shared sign-in link becomes the hub and the page to load, other text is no link, recent hubs put the last first without repeats, and a pairing code is its digits — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
8. [verified] In a real browser, the connect screen hands a pairing code to the app, shows "connecting" and why a code was refused, offers the recent hubs and a copied link, tries the saved hub again after 10 seconds, and explains an untrusted certificate without trying again — verified by `tests/e2e/android-connect.test.ts`.
9. [verified] The web app maps a bot's reply, an approval, a secret request and a report to one notification per conversation, keeps a muted group's messages quiet but not its requests, hands notifications to the app only off screen, uses the phone's recognizer and voice, shows the phone tab's notifications and keep-connected controls (or asks an older app to be updated), and puts shared text after what is typed — verified by `packages/web/test/android.test.tsx`.
10. [verified] A pairing link gives its hub and its six-digit code, inside shared text too, and a link with no code, a short code or another scheme is no pairing link — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
11. [verified] In a real browser, the connect screen's Scan QR code connects with the address and the code of the computer's QR code, says when a QR code is not Orbis's or the phone has no scanner, and does nothing when the scan is cancelled — verified by `tests/e2e/android-connect.test.ts`.

## Maturity

**MVP (committed):**

- WebView shell with a connect screen, hub-only navigation, file picker, Downloads, Back; adaptive icon; APK workflow with optional signing; launcher's phone mode.
- Pairing by code or QR code (change 0047).

**Future (aspirational, not committed):**

- Native push notifications for approvals and reports.
- Publishing in an app store.

## Out of scope for this spec

- Everything the web app renders (see `specs/web-app`).
- Running a hub or a bot on the phone.
