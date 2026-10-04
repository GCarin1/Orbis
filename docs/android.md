# Orbis on Android: the APK

The Android app shows Orbis on your phone. Orbis can run in two places:

- **On the phone itself** ([below](#orbis-on-this-phone-no-computer)). The
  hub, its database and Claude Code run inside Termux. Nothing else is needed:
  no computer, no server, no sign-in, and your data stays on the phone.
- **On another machine**: your computer on the same Wi-Fi, or a server
  ([cloud.md](cloud.md)). The app opens the web app that hub serves. (Why:
  ADR 0012.)

## Orbis on this phone (no computer)

The app can't run Orbis's programs itself, because Android forbids an app from
running programs it downloads. Two programs are needed: Node.js, and Claude
Code, which is built only for Linux. So Orbis runs inside
[Termux](https://termux.dev), a Linux terminal for Android. It runs in a Debian
that `proot-distro` makes there, and the Orbis app starts and opens it.
(Why: ADR 0018.)

**Once, to set it up** (about 10 minutes, online):

1. Install **Termux** from
   [F-Droid](https://f-droid.org/packages/com.termux/). The Play Store version
   can't take commands from other apps.
2. Open Termux, paste this and wait for it to finish:

   ```
   curl -fsSLo orbis-termux.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/android/orbis-termux.sh && bash orbis-termux.sh
   ```

   It installs these, and lets the Orbis app start commands in Termux
   (`allow-external-apps`):
   - Termux's packages;
   - Debian;
   - Node.js 22;
   - Orbis, built from this repository;
   - Claude Code (its native build, or its last JavaScript release, 2.1.112,
     when the phone can't run the native one).

   The app's first screen shows the same command, with a **Copy command**
   button.
3. Open the Orbis app and tap **Open Orbis**. When Android asks, let Orbis
   use Termux ("Run commands in Termux environment").

**Every day:** open the app.

- It starts Orbis in Termux, or finds it running, and opens it already signed
  in. There's no token to type and no pairing.
- Termux shows a notification ("1 task") while Orbis runs.
- If Android stops Termux, the app starts it again on its own.

The data stays on the phone, in Debian inside Termux (`/root/.orbis`): the
bots, the conversations, the SQLite database and the secrets vault. Nothing
goes to a cloud.

The app makes its own token for this hub and hands it over on each start, so
other apps on the phone can't drive your bots. The token never shows. Orbis
for now has no user accounts and no database outside the phone. Both are
planned for a later version of the app and the web.

**Claude Code** uses your Claude plan (Pro or Max) and never the API. Sign in
under **Settings → Brains → Claude Code**, either way:

- **Sign in with your Claude account**: the sign-in page opens in the phone's
  browser, then paste the code it shows.
- **🔑 Subscription token**: paste the token from
  `orbis-phone setup-token`, run in Termux.

**In Termux:**

| Command | What it does |
|---|---|
| `orbis-phone status` | whether Orbis runs, and which Claude Code it has |
| `orbis-phone open` | starts Orbis if it is stopped and opens the app signed in: the way in when the app cannot get Termux's permission |
| `orbis-phone serve` | runs Orbis in the terminal (Ctrl+C stops it) |
| `orbis-phone stop` | stops it |
| `orbis-phone logs` | the end of its log |
| `orbis-phone update` | takes the newest Orbis, builds it and stops the old one (the app starts the new one) |
| `orbis-phone token` | the token, and a link that signs the phone's browser in |
| `orbis-phone setup-token` | `claude setup-token`: a token for your Claude plan |

**Keep it running:**

- In Android's settings, let **Termux** run without battery limits.
- Android 12 and 13 may stop Termux's child processes. On Android 14 and
  later, *Developer options → Disable child process restrictions* lifts that.
- Orbis keeps the phone's CPU awake while it runs, so bots answer and
  routines fire with the screen off. To let the phone sleep instead (routines
  then run when it wakes), start it with `ORBIS_AWAKE=0 orbis-phone serve`.
- The app stays connected in the background (a lasting "Orbis connected"
  notification), so the bots' messages arrive as notifications. Turn it off
  in **Settings → Phone → Stay connected with the app closed**; Android then
  stops the app within minutes and the notifications stop with it.

**Not working?** The app's first screen says why, and has a fix for each:

| The screen says | What to do |
|---|---|
| Termux is missing | follow the one-time setup |
| Termux refused the app | paste the command again |
| The Termux permission is missing | **App permissions**, then allow it. If it never shows, open Termux and run `orbis-phone open`: it starts Orbis and opens the app signed in, with no permission. The line under the message (`declares=no`, `from=…`) says why it never showed |
| Orbis did not answer | in Termux, run `orbis-phone serve` to see the error |
| The install stops at `container 'debian' already exists` | an old copy of the script. Download it again and run it: the new one finds Debian wherever proot-distro keeps it, and `orbis-phone` finds it too |

To uninstall everything, run `proot-distro remove debian`, then remove
Termux.

## Get the APK

**From GitHub Actions** (no Android tools needed):

1. On GitHub: **Actions** → **Android APK** → **Run workflow**, pick the branch,
   keep **release** ticked, **Run workflow**.
2. When the run is green (about 3 minutes), open the release it made
   (**Releases** → *Orbis Android 0.1.0 (build N)*) on the phone and download
   `orbis-android-<version>-build<N>.apk`. The run's **Artifacts** hold the same
   APK in a zip.
3. Tap the APK and allow installing apps from that source when Android asks.

A tag `v*` (`git tag v0.2.0 && git push --tags`) builds and attaches the APK to
that release; a push that changes `packages/android` only builds it, to check it.

**On your computer** (Java 17+, Gradle 8.9+ and the Android SDK, as Android Studio
installs them; `ANDROID_HOME` set):

```bash
npm run android:apk        # gradle -p packages/android assembleRelease
# → packages/android/app/build/outputs/apk/release/app-release.apk
```

Android Studio opens `packages/android` too (it adds the Gradle wrapper).

## Connect the phone to your computer (another Orbis)

1. **Let the hub take connections from the network.** On Windows double-click
   `scripts\windows\Orbis-Celular.bat` (it is `Orbis.bat --celular`): it starts
   Orbis on `0.0.0.0` and prints the address to type on the phone, with the
   sign-in token, e.g. `http://192.168.0.10:7420/#token=…`. If Windows asks,
   allow Node on **private** networks. Elsewhere: `orbis serve --host 0.0.0.0`
   (or `ORBIS_HOST=0.0.0.0`).
2. **Pair the phone with the QR code.** You don't type the token.
   - On the computer, open **⚙ Settings → Phone** in Orbis and press
     **Make a code**. It shows:
     - a QR code;
     - a six-digit code, which works once, for five minutes;
     - this computer's addresses;
     - a warning when Orbis listens only on the computer.
   - In the app, tap **Scan QR code** and point the phone at the screen. The
     app trades the code for the token (`POST /api/v1/pairing/claim`) and
     opens Orbis.
     - The scanner is Google Play's own camera screen, so the app never asks
       for the camera permission.
   - With no app, the phone's camera opens the same link in the browser,
     already signed in.
   - The QR code holds `<address>#pair=<code>`, never the token. With more
     than one network card, pick the address the phone reaches.
   - No scanner (a phone without Google Play)? Type an address (a bare
     `192.168.0.10` becomes `http://192.168.0.10:7420/`) and the code, then
     press **Connect**. In a browser, type the six digits where the token
     goes.
   - Other ways in:
     - **Paste** a link copied on the computer.
     - **Share** a link to the Orbis app from another app (a chat with
       yourself, say).
     - Type the address alone. Orbis then asks for the token, which
       `Orbis-Token.bat` shows.
3. The phone must be on the same Wi-Fi as the computer, or on a VPN to it
   (Tailscale, WireGuard…). Anyone on that network who has the token can use
   your hub: keep `0.0.0.0` for networks you trust, and replace the token with
   `Orbis-Token.bat --novo` if it leaks.

The app remembers the hub, and the last five as chips on the first screen.
**⚙ Settings → Phone** shows it and **Change server** goes back to the first
screen, which also comes back by itself when the hub does not answer (computer
off, another network) — and tries again every 10 seconds. An `https` hub whose
certificate the phone does not trust is never loaded; the first screen says so.

## What the app adds to the web app

- **Notifications** while the app is off screen: a bot's reply (one per
  conversation, the latest replacing the one before), an approval or a secret
  it asks for, a manager reporting back. A tap opens that conversation. A muted
  group's messages stay quiet; its requests still notify. The app asks for the
  permission the first time it shows your hub (Android 13+); **⚙ Settings →
  Phone** asks again.
- **Stay connected with the app closed** (⚙ Settings → Phone): Android stops a
  background app within minutes, and with it the notifications. On, Orbis keeps
  running with a lasting "Orbis connected" notification (a foreground service);
  **Battery settings** lets you take it out of battery optimization if your
  phone still stops it. Off by default; it uses a little more battery.
- **Voice**: the microphone in the message box uses the phone's speech
  recognizer (its own screen), and "read replies aloud" uses the phone's voice.
- **Share to Orbis**: text or a link shared from another app waits for a
  conversation — open one and it is in the message box.
- **Back** closes what is open first — a dialog, the group info, a panel, the
  conversation — and then puts the app in the background, keeping it live.
- **Files**: a group's photo uses the phone's picker; exporting a conversation
  or a bot template saves it in **Downloads**.
- **Links** in messages open in the phone's browser; the app only shows your hub.
- Nothing is backed up or moved to another phone: the hub's address and the
  login token stay on this one.

The page itself gets no camera or microphone (a hub on plain http is not a
secure origin for them); voice goes through the phone's recognizer instead.

## Signing, and updating in place

Android installs an update only when it is signed with the same key as the app
installed. Without a key the workflow signs each APK with a throwaway debug key:
it installs, but to install a newer one you uninstall the old one first (your
hub keeps everything; on the phone you only type the address again).

To update in place, give the workflow your own key once:

```bash
keytool -genkeypair -v -keystore orbis.keystore -alias orbis -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 orbis.keystore > orbis.keystore.b64     # on Windows: certutil -encode orbis.keystore orbis.keystore.b64
```

Then in GitHub → **Settings → Secrets and variables → Actions** add
`ANDROID_KEYSTORE_BASE64` (the `.b64` text; without the `-----BEGIN/END` lines
certutil adds), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`orbis`) and
`ANDROID_KEY_PASSWORD`. Keep `orbis.keystore` safe: a lost key means uninstalling
once more. Locally the same key is read from `ORBIS_ANDROID_KEYSTORE`,
`ORBIS_ANDROID_KEYSTORE_PASSWORD`, `ORBIS_ANDROID_KEY_ALIAS` and
`ORBIS_ANDROID_KEY_PASSWORD`.

## Versions and the code

The app's version name is Orbis's (`package.json`), plus `+<commit>` outside a
tag; its version code is the workflow's build number. The code is
`packages/android` — one activity (`MainActivity.java`), the address rules
(`Hub.java`, unit-tested on the JVM), the first screen
(`assets/connect.html`) — and the icons come from the brand's SVGs with
`npm run brand:android`.
