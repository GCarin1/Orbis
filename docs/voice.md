# Voice and theme

## Talking to a bot

Press the **microphone** in the message box and speak. The words go into the
box after whatever you had typed, so you can check them and press **Send**
(or Enter). Press the microphone again (it turns into a red stop button) when
you are done.

Where the words come from depends on where you use Orbis:

| Where | How it transcribes | Setup |
|-------|--------------------|-------|
| Chrome, Edge (web app) | The browser's own speech recognition, while you speak, in the interface language | none — allow the microphone once |
| Orbis desktop app, Firefox, Safari | Records until you press stop, then sends the audio to the hub, which asks a transcription service | a transcription service in **Settings → Voice and appearance** |

The browser's recognition sends your audio to the browser's vendor (Google
for Chrome, Microsoft for Edge). The hub path sends it only to the service
you choose.

### A transcription service

Any service that speaks OpenAI's `/audio/transcriptions` API works. Fill in
**Settings → Voice and appearance → Transcription service**, press **Save**,
then **Test** (it sends a second of silence and shows how long the service
took):

| Service | Address (base URL) | Model | Key |
|---------|--------------------|-------|-----|
| OpenAI | `https://api.openai.com/v1` | `whisper-1` or `gpt-4o-mini-transcribe` | an OpenAI API key (paid per minute) |
| Groq | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | a Groq key (free tier) |
| A Whisper server on your computer, e.g. [Speaches](https://github.com/speaches-ai/speaches) | `http://localhost:8000/v1` | the model it serves, e.g. `Systran/faster-whisper-small` | none |

The key is stored encrypted on the hub (with the same master key as the
bots' secrets) and never comes back to the screen. Without anything saved,
the hub uses `ORBIS_TRANSCRIBE_URL`, `ORBIS_TRANSCRIBE_MODEL` and
`ORBIS_TRANSCRIBE_API_KEY` from its environment, and failing those OpenAI's
service with `OPENAI_API_KEY`.

A ChatGPT subscription does not include API access, so it cannot transcribe
for Orbis. On Windows, **Win + H** also dictates into any text field,
including Orbis's, with no setup.

### If the microphone does not work

- *"The microphone is blocked"*: allow it in the browser's site settings (the
  icon left of the address), or in Windows **Settings → Privacy & security →
  Microphone** for the desktop app.
- *"To speak here, set up a transcription service"*: the browser cannot
  transcribe and the hub has no service yet; add one as above.
- *"Transcription failed"*: the message after it is the service's answer
  (a wrong key answers 401, a wrong model 404).

## Hearing the bots

- **Listen** (the speaker under a bot's message) reads that message aloud.
- The speaker switch in the message box, or **Read replies aloud** in the
  settings, reads every new reply of the conversation you have open.

Reading uses your system's voices (Windows, macOS, Linux, Android, iOS), in
the interface language; nothing leaves your computer. Links, code blocks and
Markdown marks are skipped.

## Theme

The theme button at the bottom of the sidebar cycles **System → Light →
Dark**; the same choice is in **Settings → Voice and appearance**. System
follows your operating system, also when it changes at sunset. The choice is
remembered per browser (and in the desktop app).

## API

The routes are in [`api.md`](api.md#voice).
