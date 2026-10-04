# Tasks — Change 0053-android-termux-run-command

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0053-android-termux-run-command` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] `orbis-phone open`: start the hub in Termux if needed and open the app with its sign-in link (`am start`), with a test against stand-ins.
- [x] The app keeps the token of a local sign-in link, opens the hub without the permission when it already answers, and reports a diagnosis when the permission is refused.
- [x] The first screen shows the diagnosis, the `orbis-phone open` way and a button to open Termux; e2e and JVM tests.
- [x] Docs (docs/android.md): the permission that never shows, and `orbis-phone open`.
