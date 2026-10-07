# ADR 0019 — Health data comes from Health Connect through the Android app, is kept on the user's hub and reaches only the bots given health

- **Status:** accepted
- **Scope:** health, android-app, tool-gateway, web-app
- **Date:** 2026-10-07
- **Deciders:** project owner (requirement: "poder conectar a apps de monitoramento por exemplo Google fit ou Amazon fit entre outros para poder pegar essas informações para os agentes do Orbis… se eu quiser um agente de saúde"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/android/app/src/main/java/app/orbis/android/HealthBridge.kt`, `packages/hub/src/health/service.ts`, `packages/web/src/components/HealthSettings.tsx`
- **Landed:** 2026-10-07 — `packages/android/app/src/main/java/app/orbis/android/HealthBridge.kt`, `packages/hub/src/health/service.ts`

## Context

The owner wants a health bot that reads the data of their watch and phone:
Google Fit, Amazfit (the Zepp app) and others.

- Google closed the Google Fit APIs to new developers in May 2024 and
  shuts them down in 2026. It names **Health Connect** as their
  replacement on Android.
- Health Connect keeps the data **on the phone**. There is no cloud API:
  an Android app reads it with a runtime permission per kind of data.
- Zepp (Amazfit, the models since 2023), Samsung Health, Google Fit,
  Fitbit, Mi Fitness and Garmin Connect write to it. One reader covers
  them all.
- Orbis already ships an Android app around the web app (ADR 0012,
  ADR 0014), and its hub may run on that same phone (ADR 0018).
- Health data is sensitive, and `*` in a bot's allowlist gives every Orbis
  tool.

## Decision

- **The Orbis Android app reads Health Connect.** It reads only, and only
  the kinds of data the user allows. A Kotlin helper (`HealthBridge.kt`)
  reads one value per day and metric (Health Connect's own daily
  aggregates) and the workouts, for up to 90 days.
- **The page sends what the app read to the hub it shows**:
  `PUT /api/v1/health/sync`. This happens when the user syncs, or on its
  own while the app is open when the user chose so. The app itself talks
  to no hub, so the hub's token stays with the page.
- **The hub keeps the data in its own database**, one row per day and
  metric and one per workout, until the user deletes it.
- **Only the bots the user gives it read it**, with `health.summary` and
  `health.sessions`. These tools need a pattern that starts with `health.`
  in the bot's allowlist: `*` never gives them, as it never gives an MCP
  server (ADR 0010).
- The app's minimum Android version rises to 8.0 (API 26), which Health
  Connect requires. The app now compiles against API 36 with Android
  Gradle plugin 8.9.1, which Health Connect 1.1.0 requires.

## Alternatives considered

1. The Google Fit REST API: closed to new developers and being shut down.
2. A cloud API per brand (Fitbit/Google Health API, Zepp, Garmin): one
   OAuth app and one sign-in each, and Zepp has no public API for this data.
   Health Connect reaches them all from the phone.
3. The app sends the data to the hub itself, in the background: Health
   Connect allows background reads only with an extra permission (Android
   15). The app would also need the hub's token. Syncing from the page while
   the app is open keeps one path.
4. MCP servers for health data: the same per-brand APIs, behind another
   program.

## Consequences

**Positive**

- One integration covers the watch and phone apps the user already has.
- The data stays on the user's phone and hub, and only the bots they pick
  read it.

**Negative**

- It syncs only while the app is open, and only on Android.
- A bot's brain sends what it reads to its model's provider: the screen
  and the guide say so.
- Android 7 phones can no longer install the app.

**Neutral**

- A sync replaces each day's values, so the totals that Health Connect
  revises later are corrected on the next sync.
