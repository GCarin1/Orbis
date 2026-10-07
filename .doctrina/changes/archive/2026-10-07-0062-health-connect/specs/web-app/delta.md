# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The web app shall offer Settings → Health: inside the Android app, Health Connect's state, allowing it, syncing now and syncing on its own when the app opens and every 30 minutes while it is open (a choice of the device); anywhere, the last sync, its apps, the last 7 days, the bots that may read it and deleting it.
append-criterion [verified] Inside the Android app, Health Connect is allowed through the app and the days it read are synced to the hub, an outdated Health Connect sends to its install; in a browser the screen says where to connect it; a bot ticked gets the data and deleting empties the hub; the automatic sync runs only in the app and when the device chose it — verified by `packages/web/test/health.test.tsx`
```
