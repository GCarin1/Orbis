# Change 0043-android-app-and-apk-workflow — android app and apk workflow

- **Status:** applied
- **Applied:** 2026-10-03
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** runtime (confident; signals: github actions) — opened anyway (--force)
- **Affects specs:** android-app, web-app
- **Documented surface:** n/a — documented in docs/android.md, docs/windows.md and README.md with this change

## Why

The owner asked for an APK build of the app and a GitHub Actions workflow that,
when run, builds the APK of the current version. Bots, computers, brains and
secrets live with the hub on the user's computer, and the web app's PWA cannot
be installed from a plain-http hub on the local network, so the phone needs a
native app that reaches the hub over the network.

## What

- `packages/android`: a Java WebView shell (ADR 0012) — `MainActivity` (hub-only
  navigation, connect screen on failure, file picker, Downloads, Back through
  the page, no camera or microphone), `Hub` (address rules, JVM unit tests),
  `assets/connect.html` (pt-BR/en), adaptive icon rendered from the brand
  (`scripts/render-android-icons.mjs`), no backups, cleartext http for local
  addresses; version from `package.json`, build number from the workflow.
- `.github/workflows/android.yml`: by hand, on `v*` tags and on pushes that
  change the app — unit tests, lint, release APK named with the version and
  build, artifact, a release on demand or on a tag; optional signing secrets.
- Web: `native.ts` (save files through the app, the Back handler), the Android
  card in Settings, Back wired in `App`.
- Windows launcher: `--celular` and `Orbis-Celular.bat` (hub on `0.0.0.0`, the
  phone's links with the token).
- Tests: `HubTest.java`, `tests/e2e/android-connect.test.ts`,
  `packages/web/test/android.test.tsx`, the groups e2e (Back), the launcher
  test. Docs: `docs/android.md`, `docs/windows.md`, README, AGENTS.md,
  CHANGELOG; npm scripts `android:apk`, `brand:android`.

## Scope boundaries

- No hub or bot on the phone; no app store; no push notifications or microphone
  in the app yet (a plain-http hub is not a secure origin).
- The hub's default stays `127.0.0.1`: listening on the network is the user's
  choice (`--celular`, `ORBIS_HOST`).

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project, `npm run build`, and `gradle -p packages/android testReleaseUnitTest lintRelease assembleRelease` (0 lint issues).
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
