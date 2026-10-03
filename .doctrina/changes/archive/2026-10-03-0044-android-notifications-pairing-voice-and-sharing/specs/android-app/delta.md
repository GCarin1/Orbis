# Spec Delta — capability: android-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

---

```ops
bump-version minor
set-header Implementation: verified — Java WebView shell in `packages/android` (connect screen with pairing, hub-only navigation, file picker, Downloads, Back, notifications, keep-connected service, dictation, voice, share); APK built by `.github/workflows/android.yml`
replace-requirement ubiquitous 2: The Android app shall expose to the page only connecting to a hub (from its connect screen alone), reading the clipboard (from its connect screen alone), the hub's address, the app's version, changing the hub, saving a text file to Downloads, showing a notification, the notification permission, keeping connected in the background, the battery settings, the phone's dictation and the phone's voice.
append-requirement event: When the web app reports, while the app is off screen, a bot's message, an approval or a secret request, or a manager's report, the Android app shall show a notification — one per conversation, the latest replacing the one before — whose tap opens that conversation, and shall show none for a muted group's messages and reports.
append-requirement event: When the user turns on staying connected, the Android app shall run a foreground service with a lasting notification that keeps the page's connection alive in the background, until the user turns it off or removes the app from the recent apps.
append-requirement event: When the user gives a pairing code with the address, the Android app shall trade it for the hub's token through `POST /api/v1/pairing/claim` and sign in with it, or say why it was refused.
append-requirement event: When another app shares text with Orbis, the Android app shall connect if the text holds a sign-in link (`…#token=…`), and otherwise hand the text to the web app, which puts it in the message box of the next conversation opened.
append-requirement event: When the page asks for dictation or to read a reply aloud, the Android app shall use the phone's speech recognizer and voice.
append-requirement event: When a hub's saved address does not answer, the connect screen shall try it again every 10 seconds until the user stops it, and offer the last five hubs and a link from the clipboard.
append-requirement unwanted: The Android app shall not load an https hub whose certificate the phone does not trust; its connect screen shall say why.
append-criterion [verified] A shared sign-in link becomes the hub and the page to load, other text is no link, recent hubs put the last first without repeats, and a pairing code is its digits — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
append-criterion [verified] In a real browser, the connect screen hands a pairing code to the app, shows "connecting" and why a code was refused, offers the recent hubs and a copied link, tries the saved hub again after 10 seconds, and explains an untrusted certificate without trying again — verified by `tests/e2e/android-connect.test.ts`.
append-criterion [verified] The web app maps a bot's reply, an approval, a secret request and a report to one notification per conversation, keeps a muted group's messages quiet but not its requests, hands notifications to the app only off screen, uses the phone's recognizer and voice, shows the phone tab's notifications and keep-connected controls (or asks an older app to be updated), and puts shared text after what is typed — verified by `packages/web/test/android.test.tsx`.
```
