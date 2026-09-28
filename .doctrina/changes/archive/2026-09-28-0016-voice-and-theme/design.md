# Design — Change 0016-voice-and-theme

## Approach

Voice input has two paths behind one microphone button. Where the browser
ships speech recognition with a service behind it (Chrome, Edge), the
composer uses it: words appear while the user speaks, in the interface
language. Where it does not (the Electron desktop app — Chromium's API is
present there but has no Google key behind it — and Firefox), the composer
records with `MediaRecorder` and posts the audio to the hub, which forwards it
to any OpenAI-compatible `/audio/transcriptions` endpoint: OpenAI, Groq, or a
local Whisper server. The hub, not the browser, holds the key: it is saved
from the settings screen, encrypted with the vault's master key into the
`settings` table, and never returned.

Reading aloud uses the browser's `speechSynthesis`, which on Windows, macOS
and Linux speaks with the system's voices (free, offline in the desktop app).

The theme is a `data-theme` attribute on `<html>` that `theme.ts` resolves
from the saved choice (System follows `prefers-color-scheme` and its
changes); an inline script in `index.html` applies it before the first paint.

## Alternatives considered

- Whisper in the browser (WebAssembly/WebGPU): no setup, but a download of
  tens of megabytes on first use and slow on laptops without a GPU; kept as
  a possible later option.
- Transcription inside the hub process: would ship a native Whisper build per
  platform; the OpenAI-compatible endpoint covers local servers instead.
- Keeping `prefers-color-scheme` media queries and adding overrides: doubles
  every dark token; one attribute keeps a single source.

## Trade-offs and risks

- Browser dictation sends audio to the browser vendor's service; the voice
  settings say so. The hub path sends it only where the user points it.
- Automatic reading needs the page to have had a user gesture in Chrome and
  Safari; the switch itself is that gesture.

## Decisions to record as ADRs

- None: hub-wide secrets reuse the vault's key (ADR 0008 stands).
