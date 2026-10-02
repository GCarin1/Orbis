# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
bump-version minor
append-requirement event: When `Orbis.bat` runs and an Orbis hub already answers on the port (ORBIS_PORT, default 7420), the launcher shall build, stop that hub and the processes it started, wait for the port, start `orbis serve` in its own window and open the web app signed in, and the window the old hub ran in shall close without an error.
append-requirement event: When `Orbis.bat` runs with no Orbis hub on the port, the launcher shall install the dependencies when they are missing, build, start `orbis serve` in its window and open the web app signed in, building unless given `--rapido`.
append-requirement unwanted: The launcher shall not stop a process that does not answer as an Orbis hub, nor the desktop app, nor a running Orbis when the build failed; it shall name what holds the port and exit with status 1.
append-requirement event: When `Orbis-Token.bat` runs, the launcher shall show the login token of the data directory, creating it in the hub's own format when there is none, copy it to the clipboard and print the address that opens the web app signed in; given `--novo` it shall replace the token after asking.
append-requirement ubiquitous: The repository shall provide `Orbis-Atalhos.bat`, which creates shortcuts to the two launchers, with the Orbis icon, on the Desktop and in the Start menu.
append-criterion [verified] A second launcher on the same port restarts the first one with the same data and token, the first window ends with status 0 and says why, and Ctrl+C on the new one ends it quietly; a program that is not Orbis on the port is named and left running with exit status 1; a failed build leaves the running Orbis untouched; the port's owner is read from the netstat tables of an English and a Portuguese Windows; the token is created in the hub's format, kept, replaced only when asked, and left alone when ORBIS_TOKEN decides; the icon holds seven sizes up to 256 pixels and the shortcuts use it — verified by `packages/cli/test/windows-launcher.test.ts`.
```
