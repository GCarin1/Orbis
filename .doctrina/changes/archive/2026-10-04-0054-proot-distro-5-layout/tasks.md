# Tasks — Change 0054-proot-distro-5-layout

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0054-proot-distro-5-layout` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] The script asks where Debian is each time (containers/<name>/rootfs, or installed-rootfs/<name>), and removes a copy that never finished before installing.
- [x] orbis-phone looks for Debian in both places when it runs, and exits 127 with a message when it finds none.
- [x] Tests against a proot-distro 5 stand-in; changelog.
