# Design — Change 0015-orbis-look

## Approach

Follow Grok Bot's arrangement — a list of bots on the left, one conversation
in the middle, the bot's screen and routines on the right — with Orbis's own
identity. Faces are inline SVG drawn from a 100 × 100 grid: a shape, a
radial shading that makes each one read as a small planet, two slanted eyes,
and for the `orb` the orbit ring of the Orbis mark, drawn half behind and half
in front of the planet. State is shown the way Grok Bot describes it, through
motion: CSS animations on the body and on the eyes (never on the elements
that carry SVG transform attributes), switched off with reduced motion. The
state stays available in words (the face's accessible name, and a label while
the bot is busy) because the web-app spec requires it for accessibility.

Unread state lives in the browser (`localStorage`), from each conversation's
latest item time, so no new hub endpoint was needed.

## Alternatives considered

- Image avatars (PNG/emoji): rejected, they cannot move with the bot's state
  and do not follow the palette or dark mode.
- A web font or icon library for the icons: rejected, fifteen inline SVG
  icons keep the app offline-capable with no new dependency.
- Keeping the dialogs (new bot, settings) and restyling them: rejected, the
  reference opens a full screen for a new bot, which leaves room for the face
  pickers and suggestions.

## Trade-offs and risks

- Every visible face animates (a sidebar of 50 bots is 50 animations); they are CSS transforms on
  small SVGs and stop with reduced motion.
- The layout changed accessible names the end-to-end tests used ("+ New bot"
  is in the + menu, the bot settings button is an icon named "Bot settings");
  those tests were updated with the change.

## Decisions to record as ADRs

- None: this stays within ADR 0007 (one web app for browser and desktop).
