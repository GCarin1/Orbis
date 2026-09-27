# Change 0006-brand — brand

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** chore (confident; signals: readme) — opened as chore
- **Affects specs:** (none — chore)

## Why

Apply the Orbis visual identity from the project owner's brand sheet: planet-and-orbit mark with a blue to violet gradient, wordmark and tagline Open Source Autonomous AI Agents; app icon, favicon, PWA icons, web app branding and colors, README logo

## What

- `docs/brand/`: the mark (gradient, white, black), app icons (rounded and
  maskable), dark and light lockups with the wordmark and tagline, the
  social preview, a brand guide, and the owner's brand sheet as reference.
- `scripts/render-brand.mjs` (`npm run brand:icons`) renders the PNG icons
  from the SVGs.
- Web app: favicon and in-app mark, PWA icons (192, 512, maskable, Apple
  touch), manifest and theme colour, sidebar wordmark, branded sign-in
  screen, brand colours (navy background, gradient primary buttons and user
  bubbles), service worker shell cache v2.
- READMEs open with the logo (dark and light aware).

## Scope boundaries

- No behaviour changes; no spec, contract or API change.
- The desktop app will use `docs/brand/app-icon-512.png` when it lands.

## Verification

- [x] Automated checks pass (`doctrina verify`), including the end-to-end browser tests of the rebranded web app.
- [x] The rendered sign-in and app screens show the new mark, wordmark and colours (checked in screenshots).

## Open questions

- None.
