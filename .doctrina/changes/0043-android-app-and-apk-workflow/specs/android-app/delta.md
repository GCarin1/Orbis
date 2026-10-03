# Spec Delta — capability: android-app

**Operation:** ADDED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

---

# Spec — android-app

**Capability:** android-app
**Status:** active
**Implementation:** verified — Java WebView shell in `packages/android` (connect screen, hub-only navigation, file picker, Downloads, Back); APK built by `.github/workflows/android.yml`
**Realizes:** SC7
**Depends on:** web-app, hub-api
**Last updated:** 2026-10-03
**Version:** 0.1.0

## Purpose

The phone mode: an Android app (an APK) that shows the same web app on the
phone. Bots, their computers and their brains stay on the user's computer: the
app opens the web app the user's hub serves over the network, so the phone
always runs the hub's own version and needs no update when the hub changes. A
GitHub Actions workflow builds the APK of the current version on demand.

## Requirements (EARS)

### Ubiquitous

- The Android app shall show in a WebView the web app served by the hub at the address the user gave, with JavaScript and the page's storage on and file access off.
- The Android app shall expose to the page only connecting to a hub, the hub's address, the app's version, changing the hub and saving a text file to Downloads.
- The Android app shall take its version name from Orbis's version (the root `package.json`) and its version code from the build number.
- The web app shall, inside the Android app, save the files it exports (a conversation, a bot template) through the app, show the hub and the app's version in Settings with a button to change the hub, and tell the app what the phone's Back button closes first.

### Event-driven

- When the app starts with no saved hub, or the hub's page fails to load, the Android app shall show its connect screen with the hub's address, why it failed and how to let the computer's Orbis take connections from the network.
- When the user types an address, the Android app shall take a bare host as `http://<host>:7420/`, keep an explicit port and path, hand a `#token=…` fragment to the web app, save the hub and open it.
- When the page asks for a file, the Android app shall open the phone's file picker and give the page what was picked.
- When the user presses Back, the Android app shall let the web app close what is open first (a dialog, a panel, a conversation), and otherwise go back or move to the background, keeping the page.
- When the Android APK workflow runs by hand, on a `v*` tag or on a push that changes the app, it shall run the app's unit tests and lint, build a release APK named with the version and build number, attach it to the run, and publish it in a GitHub release when run by hand with release on or on a tag.
- When the Windows launcher is started with `--celular` (or `Orbis-Celular.bat`), it shall start the hub listening on the network and print the address and sign-in link of each network card for the phone.

### Unwanted-behavior (must-not)

- The Android app shall not open a page of another origin than the saved hub inside the app; a link elsewhere opens in the phone's browser or app.
- The Android app shall not grant the page the camera or the microphone, nor let its saved hub, token or files leave the phone in a backup or a device transfer.
- The APK workflow shall not need a signing key to build: without the `ANDROID_KEYSTORE_*` secrets it signs with a debug key and says so.

## Acceptance criteria

1. [verified] A bare address becomes the hub on port 7420, a full one keeps its port and its `#token=…`, an https one keeps its own port, refused addresses say why, origins write the default port out, and saved files get safe names — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
2. [verified] In a real browser, the connect screen hands the typed address to the app, translates why one is refused in Portuguese and English, shows the saved hub, why it did not answer and the app's version, and points to `Orbis-Celular.bat` — verified by `tests/e2e/android-connect.test.ts`.
3. [verified] Inside the app, exported files go to the app and not to a browser download, Settings shows the hub and the version and changes the hub, the card is hidden in a browser, and the page answers the app's Back — verified by `packages/web/test/android.test.tsx`.
4. [verified] In a real browser, the page's Back handler takes a group's search back to its info — verified by `tests/e2e/groups.test.ts`.
5. [verified] The launcher takes `--celular`, knows when the hub listens on the network, and lists a link with the token for each IPv4 network card — verified by `packages/cli/test/windows-launcher.test.ts`.
6. [verified] The workflow builds, tests, lints and names the APK with the version and build number, signs with the release key from the secrets or with a debug key, and publishes the release on demand or on a tag — verified by `.github/workflows/android.yml`.

## Maturity

**MVP (committed):**

- WebView shell with a connect screen, hub-only navigation, file picker, Downloads, Back; adaptive icon; APK workflow with optional signing; launcher's phone mode.

**Future (aspirational, not committed):**

- Native push notifications for approvals and reports.
- A QR code in the web app to connect the phone without typing.
- Publishing in an app store.

## Out of scope for this spec

- Everything the web app renders (see `specs/web-app`).
- Running a hub or a bot on the phone.
