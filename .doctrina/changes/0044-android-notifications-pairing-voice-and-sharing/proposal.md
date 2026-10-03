# Change 0044-android-notifications-pairing-voice-and-sharing — android notifications pairing voice and sharing

- **Status:** proposed
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** runtime (confident; signals: secret) — opened anyway (--force)
- **Affects specs:** android-app, hub-api, web-app
- **Documented surface:** n/a — documented in docs/android.md and docs/api.md with this change

## Why

The owner asked for an audit of the Android app and for the features it lacks.
The audit found: no notifications on the phone (the most important gap for a
chat app: the user leaves the app and never hears back); typing the long token
on a phone to sign in; a microphone that cannot work (a plain-http page has no
microphone and the WebView no speech recognition) and read-aloud without a
voice; no way to share a link into Orbis; a connect screen with no recent hubs,
no paste and no retry; a blank screen for an https hub with an untrusted
certificate; a bridge that let the hub's page point the app at another site;
and boxes on the first screen that never hid (a CSS `display` beating `hidden`).

## What

- Hub: pairing codes (`api/pairing-routes.ts`) — `POST/DELETE /api/v1/pairing`,
  and `POST /api/v1/pairing/claim` without the token; six digits, once, five
  minutes, five tries, 20 claims a minute; network addresses and whether the
  hub listens on the network.
- Web: `phone.ts` (events → one notification per conversation, off screen
  only, muted groups quiet but for requests); `native.ts` (optional bridge
  functions, open-conversation and share hooks); `voice.ts` (the phone's
  recognizer as a `Recognition`, the phone's voice); Settings → Phone
  (`PhoneSettings.tsx`: pairing card, or the app's notifications and
  keep-connected controls); the composer takes shared text; a banner waits for
  a conversation.
- Android: `Notifier` (channels, one notification per conversation, cleared on
  return), `KeepAliveService` (specialUse foreground service), `Pairing` (the
  code traded for the token), dictation (RecognizerIntent) and voice
  (TextToSpeech), share intent, recent hubs, clipboard, the notification
  permission, untrusted certificates refused, `connect` only from the connect
  screen, the connect screen's code field, retry and `[hidden]` fix.
- Tests: `HubTest.java`, `pairing.test.ts`, `android.test.tsx`,
  `android-connect.test.ts`, `phone-pairing.test.ts`. Docs: `docs/android.md`,
  `docs/api.md`, CHANGELOG, the contract.

## Scope boundaries

- No push service (Firebase): notifications come from the page's own connection
  to the hub, kept alive by the opt-in foreground service.
- The status bar stays the brand's night blue in the light theme.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project, `npm run build`, and `gradle -p packages/android testReleaseUnitTest lintRelease assembleRelease` (0 lint issues).
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
