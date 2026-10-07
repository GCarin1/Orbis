<!-- delta body below -->
# Spec — health

**Capability:** health
**Status:** active
**Implementation:** verified — `packages/hub/src/health/service.ts` (the sync, the days and workouts, the status, the bots' access, `health.summary` and `health.sessions`, wiping), `packages/android/app/src/main/java/app/orbis/android/HealthBridge.kt` and `HealthDays.kt` (reading Health Connect), the web app's Settings → Health (`HealthSettings.tsx`, `health.ts`)
**Realizes:** SC15
**Depends on:** android-app, tool-gateway, bots
**Last updated:** 2026-10-07
**Version:** 0.1.0

## Purpose

A health bot reads the data of the user's watch and phone. Health Connect
holds it on the phone: Google Fit, Zepp (Amazfit), Samsung Health, Fitbit,
Mi Fitness and Garmin Connect write there. The Orbis Android app reads it,
only to read and only what the user allows. The page sends it to the
user's own hub, which keeps one value per day and metric, and the
workouts. Only the bots the user gives it to read it (ADR 0019).

## Requirements (EARS)

### Ubiquitous

- The system shall keep, per day, the user's steps, distance, active and total calories, average, lowest and highest heart rate, resting heart rate, sleep and its deep, REM, light and awake minutes, exercise minutes, weight, body fat and average blood oxygen, each with its unit, and the user's workouts with their type, start, end, title and the app that recorded them.
- The system shall keep the time of the last sync and the apps the data came from, and say how many days have data, from which day to which.
- The system shall give the health tools (`health.summary`, `health.sessions`) only to a bot whose allowlist names them by a pattern that starts with `health.`.
- The Android app shall read from Health Connect only the kinds of data the user allowed, at most 90 days back, each day's totals as Health Connect merges them across apps, the sleep stages of each night on the day it ended, and the workouts.

### Event-driven

- When the page sends a sync, the system shall replace the values of each day it carries, keep the workouts by id, and add the apps it names to the apps the data came from.
- When the user gives or takes the health data from a bot, the system shall add `health.*` to its allowlist or remove every `health.` pattern from it, keeping its other patterns.
- When a bot calls `health.summary`, the system shall answer with the last sync, its apps and a table of the days asked for (7 by default), a column per metric with a value, in units people read (hours and minutes, kilometres); `health.sessions` with the workouts of the days asked for (14 by default).
- When the user deletes the health data, the system shall delete every value, workout and sync record.

### Unwanted-behavior (must-not)

- The system shall not accept a sync of more than 120 days or 1,000 workouts, a date not written YYYY-MM-DD, a metric it does not keep, or a value that is negative or not a number.
- The Android app shall not write to Health Connect, nor read it for any page but the hub's.

## Acceptance criteria

1. [verified] A sync keeps each day's values and the workouts, a day sent again is replaced and the other days stay, the apps add up, the status says the days and the last sync, and deleting empties everything; a bad date, an unknown metric, a negative value and 121 days are refused — verified by `packages/hub/test/health.test.ts`
2. [verified] `*` does not give the health tools and a call is refused; given `health.*`, the bot reads a table of its days with readable units and its workouts, and taking it back keeps its other patterns; with no data the tool says how to connect it — verified by `packages/hub/test/health.test.ts`
3. [verified] A night's deep, REM and awake-in-bed minutes add up on the day it ended in the phone's timezone, out-of-bed time is not sleep, and workout types read as words — verified by `packages/android/app/src/test/java/app/orbis/android/HealthDaysTest.kt`

## Maturity

**MVP (committed):**

- Daily metrics and workouts from Health Connect, synced from the open app, read by the bots given them.

**Future (aspirational, not committed):**

- Syncing in the background (Health Connect's background read permission).
- Heart rate and sleep samples finer than a day.

## Out of scope for this spec

- iPhone (Apple Health) and cloud APIs of each brand.
