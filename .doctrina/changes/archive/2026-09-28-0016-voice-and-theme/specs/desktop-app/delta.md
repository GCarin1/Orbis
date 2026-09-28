# Spec Delta — capability: desktop-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/desktop-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The desktop app shall grant the hub's page notifications and the microphone alone (for voice input), and refuse the camera, the screen and every permission to other pages.
append-criterion [verified] The hub's page gets notifications and an audio-only microphone request, while a request with video, the screen, or from another origin is refused — verified by `packages/desktop/test/window.test.ts`.
```
