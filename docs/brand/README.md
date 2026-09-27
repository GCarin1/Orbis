# Orbis brand

The mark is a planet inside a thick ring, crossed in front by a tilted orbit,
with a moon at the top right and a small satellite at the bottom left. It is
drawn from the project owner's brand sheet ([`brand-sheet.png`](brand-sheet.png)).
The SVGs here are the source of truth; `npm run brand:icons` renders the PNG
icons from them (Playwright's Chromium, or `ORBIS_BROWSER_EXECUTABLE`).

| File | Use |
|------|-----|
| `mark.svg` | the gradient mark: favicon, in-app logo (copied to `packages/web/public/icon.svg`) |
| `mark-white.svg` / `mark-black.svg` | one-colour mark for dark / light backgrounds |
| `app-icon.svg`, `app-icon-512.png` | app icon: the mark on a navy rounded square (desktop app, PWA) |
| `app-icon-maskable.svg` | full-bleed PWA icon, mark inside the safe zone |
| `logo-dark.svg` / `logo-light.svg` | horizontal lockup — mark, wordmark, tagline — for dark / light backgrounds |
| `social-preview.png` | 1280×640 repository social preview |

## Colours

| Name | Value | Where |
|------|-------|-------|
| Cyan | `#3ecbff` | gradient start (top left) |
| Blue | `#3b82f6` | gradient middle |
| Violet | `#7c4dff` | gradient end (bottom right) |
| Navy | `#0b1020` | backgrounds, theme colour |
| Button gradient | `#2563eb → #4f46e5 → #6d28d9` | deeper stops so white text stays readable (≥ 4.5:1) |

## Type

Wordmark: a geometric sans, semibold (Poppins or Montserrat, falling back to
the system sans). Tagline: **Open Source Autonomous AI Agents**, small,
letter-spaced. Secondary line: *More agents. Bigger possibilities.*

## Rules

- Keep the mark's proportions; do not recolour it outside the gradient or
  the one-colour versions.
- Leave clear space around the mark of at least the moon's diameter.
- Below 24 px, use the mark without the wordmark.
