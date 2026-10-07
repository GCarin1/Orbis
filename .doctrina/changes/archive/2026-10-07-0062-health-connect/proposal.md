# Change 0062-health-connect — health-connect

- **Status:** applied
- **Applied:** 2026-10-07
- **Date:** 2026-10-07
- **Owner:** Orbis maintainers
- **Lane:** product
- **Affects specs:**

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

Health data from Health Connect: the Android app reads the user's wearable data, the page syncs it to the hub, only bots given health.* read it

## What

- New capability `health` (Realizes SC15, ADR 0019).
- Hub: `packages/hub/src/health/service.ts`, migration 14 (`health_metrics`,
  `health_sessions`); routes `PUT /health/sync`, `GET /health/status`,
  `GET /health/summary`, `POST /health/bots`, `DELETE /health`; tools
  `health.summary` and `health.sessions`, given only by a `health.` pattern
  (`toolAllowed` takes the prefix a tool needs; `ToolInfo.explicit`).
- Android: Kotlin, Health Connect 1.1.0 (Android Gradle plugin 8.9.1,
  compileSdk 36, minSdk 26); `HealthBridge.kt`, `HealthDays.kt`,
  `HealthPrivacyActivity`; 11 read permissions; the bridge's
  `healthStatus/healthCheck/healthRequest/healthRead/openHealthConnect`.
- Web: Settings → Health (`HealthSettings.tsx`), `health.ts` (sync and
  automatic sync), the tool picker's health group.
- Docs: `docs/health.md`, `docs/android.md`, README, CHANGELOG, the
  hub-surface contract.

## Scope boundaries

- No background sync: Health Connect's background read permission is
  left for later.
- Nothing is written to Health Connect.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
