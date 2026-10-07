# Spec Delta — capability: android-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement ubiquitous 2: The Android app shall expose to the page only starting the hub on this phone, its state, its install command, Termux and the app's permission settings (from its connect screen alone), starting the hub on this phone again (when it is the saved hub), connecting to a hub (from its connect screen alone), reading the clipboard (from its connect screen alone), reading a QR code with Google Play's code scanner (from its connect screen alone), the hub's address, the app's version, changing the hub, saving a text file or a conversation's file to Downloads, showing a notification, the notification permission, keeping connected in the background, the battery settings, the phone's dictation and the phone's voice.
append-requirement event: When the page asks for more than one file, the Android app shall give it every file picked in the phone's picker.
append-criterion [verified] Inside the Android app, a conversation's file is saved to Downloads through the app with its bytes — verified by `packages/web/test/files.test.tsx`
```
