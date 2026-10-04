# Spec Delta — capability: android-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement event 8: Unless the user turned staying connected off (it is on by default), the Android app shall run a foreground service with a lasting notification that keeps the page's connection alive in the background, so the bots' notifications keep coming, until the user turns it off or removes the app from the recent apps.
append-requirement event: When `orbis-phone serve` runs the hub on the phone (started by the app or by hand), the system shall hold Termux's wake lock while the hub runs, so bots answer and routines fire with the screen off, unless `ORBIS_AWAKE=0`.
append-criterion [verified] The app stays connected in the background unless the user turns it off — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`
append-criterion [verified] With stand-ins for Termux, the hub started the way the app starts it takes Termux's wake lock — verified by `packages/hub/test/phone-script.test.ts`
```
