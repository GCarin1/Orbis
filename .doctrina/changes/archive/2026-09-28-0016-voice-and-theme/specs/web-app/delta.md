# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: verified — the Orbis look: bot faces with state motion, one conversation list with search and unread dots, dark and light bubbles with time separators and "Messages from", mention chips, the pill composer with the microphone and the read-aloud switch, the bot panel (screen, routines, team, brain), the new-bot screen with face pickers and suggestions, the phone layout, the System/Light/Dark theme; timeline cards, the skills, usage, routines, computer, bot settings and settings screens (brains, voice and appearance), approvals inbox, languages, PWA and the end-to-end paths
bump-version minor
replace-requirement ubiquitous 3: The web app shall provide a composer with a button that starts a mention, autocomplete for `@handle` and `@role` mentions and `/skill` invocations, a microphone, a switch that reads replies aloud, and a send button.
replace-requirement ubiquitous 4: The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, settings in tabs (the brains on the hub's machine and the brain of each bot; voice and appearance), the approvals inbox, and the computer view as a side panel and full screen.
append-requirement ubiquitous: The web app shall offer three themes — follow the system, light and dark — from a switch in the sidebar and in the settings screen, remembered per browser and applied before the first paint.
append-requirement event: When the user presses the microphone, the web app shall write what the user says into the composer after the text already there, with the browser's speech recognition in the interface language, or, where the browser has none, by recording until the user presses stop and sending the recording to the hub's transcription service; the user reviews the text and sends it.
append-requirement event: When a bot message arrives in the open conversation while reading aloud is on, the web app shall read it with the system's voices in the interface language; any bot message can be read on demand with its Listen button.
append-requirement unwanted: If neither the browser nor the hub can transcribe, or the microphone is blocked, the web app shall say how to fix it instead of recording.
append-criterion [verified] The microphone writes what the browser hears after the typed text and stops on send; without browser dictation it records and sends the audio to the hub and writes the returned text; with neither it explains the setup; Listen reads a reply, reading aloud reads only new bot replies; the voice settings save the service without showing the key back and test it; the theme switch cycles System, Light and Dark, applies and remembers it — verified by `packages/web/test/voice.test.tsx`.
append-criterion [verified] In a real browser with a fake microphone and no dictation, the user speaks, the recording goes through the hub to a transcription service, the words land in the composer and are sent, and the dark theme picked in the sidebar survives a reload — verified by `tests/e2e/voice.test.ts`.
```
