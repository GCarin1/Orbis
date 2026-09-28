# Change 0016-voice-and-theme — Voice and theme

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (uncertain)
- **Affects specs:** web-app, hub-api, desktop-app

## Why

The project owner wants to talk to the bots with the microphone, like Grok
Bot's composer, and to pick a dark theme. Dark mode followed the operating
system only; there was no voice at all. They use the desktop app on Windows,
where the browser's speech recognition does not work.

## What

- Hub (`voice/service.ts`, `repos/settings.ts`, `secrets/hub-secrets.ts`):
  `GET /api/v1/voice`, `PUT /api/v1/voice/transcription`,
  `POST /api/v1/voice/test`, `POST /api/v1/voice/transcribe` (audio body);
  the service from the settings screen, else `ORBIS_TRANSCRIBE_URL`
  (+ `ORBIS_TRANSCRIBE_MODEL`, `ORBIS_TRANSCRIBE_API_KEY`), else OpenAI with
  `OPENAI_API_KEY`; hub-wide secrets encrypted with the vault's key.
- Web (`voice.ts`, `theme.ts`, `Composer.tsx`, `Timeline.tsx`,
  `ThemeSwitch.tsx`, `VoiceSettings.tsx`, `SettingsScreen.tsx`, `App.tsx`,
  `styles.css`, `index.html`): the microphone, Listen and read-aloud, the
  theme switch and the settings tabs.
- Desktop (`window.ts`, `main.ts`): the microphone permission, audio only.
- Tests: hub `voice`, web `voice`, desktop `window`, e2e `voice`.
- Docs: `docs/voice.md`, `docs/api.md`, READMEs, CHANGELOG, `.env.example`;
  contract hub-surface (routes and variables).

## Scope boundaries

- No speech recognition inside the hub or the browser (no Whisper model is
  shipped); the hub forwards to a service the user chooses.
- No spoken conversation loop (wake word, talking over the bot); the user
  presses the microphone and sends.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`), including the new hub, web, desktop and end-to-end tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).
- [x] In a real browser with a fake microphone, a spoken message goes through the hub's transcription into the composer (`tests/e2e/voice.test.ts`).

## Open questions

- None.
