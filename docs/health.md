# Health data for your bots

Give a health bot the data of your watch and phone: steps, distance,
calories, heart rate, resting heart rate, sleep and its stages, workouts,
weight, body fat and blood oxygen. Then ask it how you slept this week, or
whether your resting heart rate went up after the long runs.

## How it works

Google stopped the Google Fit APIs for new apps, and they end in 2026. On
Android, the place that holds this data now is **Health Connect**, on the
phone itself. These apps write there:

| App | Watches | How to send it to Health Connect |
|-----|---------|----------------------------------|
| **Zepp** (Amazfit) | Amazfit since 2023 (Bip 5, GTS 4, GTR 4, T-Rex Ultra, Cheetah and newer) | Zepp → Profile → Add accounts → Health Connect, allow every kind |
| **Samsung Health** | Galaxy Watch | Samsung Health → ⋮ → Settings → Health Connect |
| **Google Fit** | Wear OS | Google Fit → Profile → ⚙ → Sync with Health Connect |
| **Fitbit** | Fitbit, Pixel Watch | Fitbit → Today → your photo → Health Connect |
| Mi Fitness, Garmin Connect, Withings, Oura | their own | in each app's settings, "Health Connect" |

The Orbis Android app reads Health Connect, only to read and only the kinds
of data you allow. The page then sends what it read to **your own hub**,
which keeps one value per day and metric, and the workouts. Only the bots
you choose read it.

## Step by step

1. **Health Connect.** Android 14 and newer have it built in (Settings →
   Security and privacy → Privacy → Health Connect, or search "Health
   Connect"). On Android 9 to 13, install **Health Connect** from the Play
   Store.
2. **Your watch's app** writes to Health Connect: see the table above. Open
   it once so it sends the last days.
3. **The Orbis app** (APK of this version or newer): ⚙ **Settings →
   Health** → **Allow access**. Health Connect shows a switch per kind of
   data. Turn on what you want the bots to see.
4. **Sync now**. The table shows your last 7 days. Tick **Sync on its own**
   for the app to sync when it opens and every 30 minutes while it is open.
5. **Choose the bots**: under *Bots that may read it*, tick your health bot.
   That adds `health.*` to its tools. `*` alone never gives the health
   data.
6. **Ask it**: "How did I sleep this week?", "Compare my steps with last
   week", "Is my resting heart rate going up?", "What workouts did I do in
   the last 14 days?".

A health bot pairs well with [initiative](initiative.md). Turned on, it can
write to you on its own, for example after a short night.

## What the bots read

| Tool | Answers |
|------|---------|
| `health.summary` | A table of the last days (7 by default, up to 90): one row per day, a column per metric with data, in units people read (7 h 5 min, 6.2 km, 58 bpm). It also says the last sync and the apps the data came from. |
| `health.sessions` | The workouts of the last days (14 by default): type, start, duration, the app that recorded them. |

## Privacy

- The app only **reads** Health Connect, and only the kinds of data you
  allowed. It never writes there.
- The data goes only to your own hub, on this phone or on the computer you
  connected. It leaves only when you sync.
- A bot's brain sends what it reads to its model's provider (Anthropic,
  OpenAI…). Give the health data only to a bot whose brain you trust with
  it.
- **Delete my health data** (Settings → Health) deletes it from the hub.
  To stop the reading, turn the permissions off in Health Connect.

## Limits

- It syncs only while the Orbis app is open. Health Connect lets apps read
  in the background only with an extra permission, which this version does
  not ask for.
- Android only: an iPhone keeps this data in Apple Health, which Orbis does
  not read.
- Older Amazfit models (Bip 3, GTR 3, GTS 2) do not write to Health
  Connect.
- The app needs Android 8.0 or newer, and Health Connect needs Android 9 or
  newer.
