# Change 0052-hub-on-the-phone — Orbis on the phone, with no computer

- **Status:** proposed
- **Date:** 2026-10-04
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** android-app
- **Documented surface:** n/a — documented in docs/android.md, docs/cloud.md, the READMEs, the APK release notes and CHANGELOG with this change

## Why

The owner opened the app with the computer off and saw "Reconnecting to the
hub": the app was only the interface. They want:

- the app to work with no computer and no server in between;
- no step that makes a token on the computer to let the phone in;
- no sign-in barrier, with the data kept on the phone.

Accounts and a shared database come later and are recorded as such.

## What

- `scripts/android/orbis-termux.sh`, pasted once in Termux, installs:
  - Termux's packages;
  - a Debian (proot-distro);
  - Node.js 22;
  - Orbis, built from the repository;
  - Claude Code (native, else 2.1.112 in JavaScript).

  It also turns on `allow-external-apps` and installs `orbis-phone`: `serve`
  (the token on stdin), `stop`, `status`, `logs`, `update`, `token` and
  `setup-token`. Debian commands run from a clean environment.
- Android:
  - `LocalHub`;
  - MainActivity starts the hub through Termux's RUN_COMMAND, with its own
    token, waits for it and opens it signed in;
  - the result of Termux's run comes back through `TermuxResult`;
  - the manifest has the Termux permission and query;
  - the connect screen puts Orbis on this phone first, with the one-time
    setup and the reasons a start failed. Another Orbis is in a section
    below;
  - the repository is in BuildConfig (`-PorbisRepo` in CI).
- Web: `keepLocalHubUp` asks the app to start the hub again when the stream
  stays down. The Claude Code hints no longer assume a computer
  (`orbis-phone setup-token`).
- Product: SC14, and accounts with a shared database recorded as later. Spec:
  delta to `android-app`. ADR 0018.
- Tests:
  - `LocalHubTest`
  - `packages/hub/test/phone-script.test.ts`
  - `tests/e2e/android-connect.test.ts`
  - `packages/web/test/android.test.tsx`
- Real run: the install and the hub in Debian under Termux's proot (built from
  source) on x86_64. Checked:
  - Node.js 22, the build, and Claude Code 2.1.289 native;
  - serve with the app's token, already running, a restart with a new token;
  - a claude-code bot refused by Anthropic with the subscription-token hint;
  - stop.

## Scope boundaries

- No accounts, no sign-in screen, no cloud database: the hub's own SQLite on
  the phone (ADR 0018).
- The APK does not contain Node.js or Claude Code: Termux runs them.
- Not tried on a physical phone from here (no Android device or emulator in
  this environment); the Android code is checked by unit tests and lint, and
  the Termux side by the emulation above.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`, and the Android unit tests, lint and release build.
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).
- [x] The install and the hub ran in Debian under Termux's proot: Claude Code native, the app's token, restart, stop (manual).

## Open questions

None.
