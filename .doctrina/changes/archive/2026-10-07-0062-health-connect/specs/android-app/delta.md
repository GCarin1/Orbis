# Spec Delta — capability: android-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement ubiquitous 2: The Android app shall expose to the page only starting the hub on this phone, its state, its install command, Termux and the app's permission settings (from its connect screen alone), starting the hub on this phone again (when it is the saved hub), connecting to a hub (from its connect screen alone), reading the clipboard (from its connect screen alone), reading a QR code with Google Play's code scanner (from its connect screen alone), the hub's address, the app's version, changing the hub, saving a text file or a conversation's file to Downloads, showing a notification, the notification permission, keeping connected in the background, the battery settings, the phone's dictation, the phone's voice, and Health Connect's state, its permission screen, the kinds of health data the user allowed and reading them (from the hub's page alone).
append-requirement ubiquitous: The Android app shall install on Android 8.0 (API 26) or newer, declare a read permission for each kind of health data it reads, and show why it reads them on the screen Health Connect opens from its permission settings.
append-requirement event: When the page asks to allow health data, the Android app shall open Health Connect's permission screen and tell the page the kinds of data the user allowed; when Health Connect must be installed or updated, it shall open its page in the Play Store.
append-criterion [verified] A night's stages add up on the day it ended and workouts are named, as the app sends them to the page — verified by `packages/android/app/src/test/java/app/orbis/android/HealthDaysTest.kt`
```
