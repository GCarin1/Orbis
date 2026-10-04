# ADR 0018 — The phone runs its own hub inside Termux, started by the app; no accounts and no shared database yet

- **Status:** proposed
- **Scope:** android-app, hub-api, agent-runtimes
- **Date:** 2026-10-04
- **Deciders:** project owner (requirements: "quando eu abra no aplicativo eu não precise do computador… se for para rodar no telefone, eu não quero só a interface, eu quero que as chamadas também sejam ligadas… não quero um intermediador"; "remova essa etapa de gerar o token pelo computador… o usuário só baixe e acesse… não quero uma barreira de autenticação… um banco de dados guardado no meu telefone… futuramente vamos ter autenticação e um banco de dados para o aplicativo e para a web"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `scripts/android/orbis-termux.sh`, `packages/android/app/src/main/java/app/orbis/android/LocalHub.java`, `packages/android/app/src/main/java/app/orbis/android/MainActivity.java`
- **Landed:** —

## Context

The Android app is a WebView shell around the web app a hub serves (ADR 0012,
ADR 0014). Until now the hub ran on the user's computer, or on a server
(ADR 0017), and the phone paired with it by a code. The owner wants three
things:

- The app working with the computer off.
- No server in between.
- No sign-in or pairing step, with the data kept on the phone.

The hub needs:

- Node.js 22 (`node:sqlite`).
- Claude Code, the brain that uses the owner's Claude plan. Since 2.1.113 it
  ships only native Linux builds (glibc or musl), and no Android build.

An Android app targeting a current SDK cannot run programs it downloads (W^X,
Android 10 and later). nodejs-mobile embeds Node.js 18, which has no
`node:sqlite`. Termux is built to run such programs. It accepts commands from
other apps through `RUN_COMMAND`, once the user allows it (a runtime permission
and `allow-external-apps`).

## Decision

- **The hub runs on the phone, inside Termux, in a Debian made by
  proot-distro.** `scripts/android/orbis-termux.sh` is pasted once in Termux
  and installs:
  - Node.js 22, from nodejs.org;
  - Orbis, built from the repository;
  - Claude Code. If its native build cannot run there, its last JavaScript
    release, 2.1.112.

  It installs `orbis-phone`, and turns on `allow-external-apps`. Debian
  commands start from a clean environment. Termux's PREFIX, LD_PRELOAD and
  TMPDIR mean nothing in Debian, and npm would install into PREFIX.
- **The app starts the hub and opens it.**
  - "Open Orbis", or opening the app on the hub on this phone, first checks
    127.0.0.1:7420. If the hub is not there, the app asks Termux to run
    `orbis-phone serve` in the background, waits, and loads the web app
    signed in.
  - Termux's own foreground task keeps the hub alive.
  - When Android stops it anyway, the web app asks the app to start it again.
- **No sign-in, but not open to every app.** The hub keeps its bearer token.
  Without it, any app on the phone could drive the bots through 127.0.0.1.
  - The app makes the token itself (32 random bytes) and hands it over on
    `serve`'s standard input on each start. It is never in a command line,
    never shown and never typed.
  - The hub listens on 127.0.0.1 only.
  - The user sees no barrier: no token, no code, no account.
- **The data stays on the phone.** The hub's own SQLite database, vault and
  workspaces live inside Termux (`/root/.orbis`). There is no cloud database.
- **Another Orbis stays possible.** Connecting to a computer or a server by
  its address, code or QR code moves behind "Connect to another Orbis" on the
  first screen. It is no longer a step of the default path.
- **Later, not now:** user accounts with sign-in, and a database shared by the
  app and the web across devices. They are recorded as out of scope in the
  product. A later ADR will decide them, and supersede this one's "no
  accounts" part.

## Alternatives considered

1. **Node.js inside the APK (nodejs-mobile).** Its Node.js 18 has no
   `node:sqlite`, and Claude Code would still have no Android build.
2. **Termux alone, without Debian.** Node.js and the build work there. But
   Claude Code would be pinned to its last JavaScript release, since its
   native builds need glibc. Debian runs the current one, and keeps the
   JavaScript release as the fallback.
3. **Rewrite the hub for Android.** Months of work, and two hubs to keep in
   step.
4. **A server the phone talks to** (ADR 0017). The owner asked for no
   intermediary. It stays available as "another Orbis".
5. **Drop the hub's token on the phone.** Any app on the phone could then
   reach 127.0.0.1:7420 and run commands through the bots. The token the app
   keeps gives the same "no sign-in" experience without that.

## Consequences

**Positive**

- The app works with the computer off, on the owner's Claude plan, with the
  data on the phone. Opening it needs no token, code or account.
- The phone runs the same hub, brains and web app as the computer. No second
  implementation.

**Negative**

- A one-time setup in Termux (F-Droid), about 10 minutes and a few hundred MB.
- Android's battery rules may pause or stop Termux. The user is told how to
  let it run, and the app starts the hub again.
- With the screen off, routines may wait until the phone wakes, unless
  `--awake` keeps the CPU on.

**Neutral**

- Updates come from `orbis-phone update` (pull and build), not from the APK.
  The web app comes from the hub, as before.

<!--
Once this ADR is accepted, do not edit it. To change the decision,
create a new ADR that supersedes this one and update the "Superseded by"
header above to point at the new ADR. Status transitions:
proposed -> accepted | rejected
accepted -> deprecated | superseded by NNNN
-->
