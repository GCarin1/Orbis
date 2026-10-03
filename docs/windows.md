# Orbis on Windows: start, restart and sign in with a double-click

The scripts in `scripts/windows/` start Orbis, give you its login token, open it
to your phone and put Orbis-icon shortcuts on your Desktop and Start menu. They need Node.js
22.12 or later and a built checkout (`npm install` first).

| Script | What it does |
|---|---|
| `Orbis.bat` | Installs what is missing, builds (`npm run build`), starts the hub in this window and opens the web app already signed in. **If Orbis is already running, it restarts it:** it builds first, stops the old hub, starts the new one and closes the old window. |
| `Orbis-Token.bat` | Shows the login token (and copies it), creating it when there is none. `Orbis-Token.bat --novo` replaces it. |
| `Orbis-Celular.bat` | `Orbis.bat --celular`: starts Orbis listening on the network (`ORBIS_HOST=0.0.0.0`) and prints the address, with the token, to type in the Android app — see [android.md](android.md). |
| `Orbis-Atalhos.bat` | Creates the **Orbis** and **Orbis Token** shortcuts, with the Orbis icon, on the Desktop and in the Start menu. Run it once. |

A `.bat` file cannot carry an icon; a shortcut can. That is why the icon lives in
the shortcuts (`docs/brand/orbis.ico`, made from the brand's SVG by
`npm run brand:ico`): **use the Orbis shortcut, not the `.bat`** (copying the
`.bat` to the Desktop copies a file with no icon). `Orbis.bat` makes the shortcuts
itself the first time it runs (`--atalhos` makes them again, `--sem-atalhos` never
does). Pin the **Orbis** shortcut to the taskbar if you like. To set the icon by
hand: right-click a shortcut → Properties → Change Icon → `docs\brand\orbis.ico`.

## `Orbis.bat`

After a `git pull`, double-click it: it builds the new code and replaces the
running hub. Your bots, conversations and secrets stay as they were, because
they live in the data folder (`~/.orbis`), not in the process.

What it does, in order:

1. Runs `npm install` when `node_modules` is missing (or with `--instalar`), then
   `npm run build` (skip with `--rapido` when nothing changed). A failed build
   stops here and leaves the running Orbis alone.
2. Looks at the port (`ORBIS_PORT`, default `7420`).
   - An **Orbis hub** answering there (`/health`) is stopped, with the bot
     processes it started, and the port is awaited. The Orbis desktop app is not
     stopped this way: close it yourself.
   - **Another program** holding the port is never touched: the script says which
     one and stops. Use another port with `set ORBIS_PORT=7421`.
3. Starts `orbis serve` in this window. **Closing the window, or Ctrl+C, stops
   Orbis.** The web app opens in your browser already signed in
   (`--sem-navegador` skips it).

When the old window's server is stopped by a restart, that window says so and
closes by itself; a crash keeps the window open with the error.

## `Orbis-Token.bat`

The hub keeps its API token in `~/.orbis/token` (or `ORBIS_DATA_DIR`) and
creates it the first time it runs. The web app asks for it at the login screen.

- Without options the script shows the token, makes the file in the hub's format
  when it is missing, copies the token to the clipboard and prints a link that
  opens the web app already signed in.
- `--novo` asks, then writes a new token (`--sim` skips the question). The hub
  reads the token when it starts, so restart it (`Orbis.bat`) and sign in again
  with the new one.
- When `ORBIS_TOKEN` is set, it decides and the file is ignored; the script says so
  and changes nothing.
- When `orbis login` saved another token in `~/.config/orbis/config.json`, the
  terminal client prefers it; the script warns when it differs.

The token is a password to your hub: do not share it.
