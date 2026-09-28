# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 4: The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, settings in tabs (the brains on the hub's machine and the brain of each bot; the kinds of computer; voice and appearance), the approvals inbox, and the computer view as a side panel and full screen.
append-requirement ubiquitous: The web app shall let the user pick each bot's computer among three cards — a private folder, "My computer" with the folder it works in, and a Docker container — show what Docker needs with a button that prepares the desktop image, and name the bot's kind of computer under its screen.
append-requirement unwanted: The web app shall not save "My computer" for a bot that did not have it until the user ticks the consent that says what the bot will be able to do.
append-criterion [verified] Bot settings offer the three kinds of computer; "My computer" takes a folder and saves only after the consent, and not again for a bot that has it; the container shows Docker's state and prepares the image with one click; the computers tab explains the three kinds and what Docker needs; the bot panel names the kind of computer — verified by `packages/web/test/computers.test.tsx`.
append-criterion [verified] In a real browser, the user gives a bot their own folder with the consent, the panel names it, the bot's file write waits for "Allow once" and then lands in that folder, and the settings screen explains the three kinds — verified by `tests/e2e/computer-modes.test.ts`.
```
