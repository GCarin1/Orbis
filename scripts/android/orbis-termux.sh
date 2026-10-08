#!/data/data/com.termux/files/usr/bin/bash
# Orbis on this phone (docs/android.md, ADR 0018): the hub, the web app and Claude Code run inside
# Termux, in a Debian made by proot-distro, so the Orbis app works with the computer off and no server
# in between. The first time, in Termux:
#
#   curl -fsSLo orbis-termux.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/android/orbis-termux.sh && bash orbis-termux.sh
#
# Afterwards, `orbis-phone <command>`:
#   install   Termux's packages, Debian, Node.js, Orbis and Claude Code (run again to bring them up to date)
#   open      start the hub if needed and open the Orbis app signed in: no Android permission needed
#   serve     run the hub on 127.0.0.1:7420 until it is stopped — the Orbis app starts it this way
#             (--token-stdin: the app's token on the first line of stdin; it keeps the CPU awake while it
#             runs, unless ORBIS_AWAKE=0)
#   stop      stop the hub
#   status    whether the hub runs, and which Claude Code it has
#   logs      the end of the hub's log
#   update    pull the newest Orbis, build it again and stop the hub (the app starts the new one)
#   token     the hub's token, and a link that signs the phone's browser in
#   setup-token  Claude Code's `claude setup-token`: a token for your Claude plan, to paste in Orbis
#   link      make this phone's hub a device of your Orbis account (email and password at prompts); unlink
#             leaves it (--status: what it sent, --sync: send now)
set -euo pipefail

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
STATE="${ORBIS_PHONE_STATE:-$HOME/.orbis-phone}"
# What `install` was given (the repository, the branch), kept for `update`.
# shellcheck source=/dev/null
[ -f "$STATE/config" ] && . "$STATE/config"
DISTRO="${ORBIS_DISTRO:-debian}"
REPO="${ORBIS_REPO:-https://github.com/GCarin1/Orbis.git}"
BRANCH="${ORBIS_BRANCH:-}"
PORT="${ORBIS_PORT:-7420}"
NODE_MAJOR="${ORBIS_NODE_MAJOR:-22}"
# The last Claude Code written in plain JavaScript: it runs on Node.js where the native build cannot.
CLAUDE_JS_VERSION="2.1.112"
APP=/root/orbis
# The command line of the hub inside Debian (never another Orbis); the brackets keep a pkill from
# matching the command that runs it.
SERVE_MATCH="$APP/[p]ackages/cli/dist/index.js serve"

# Where proot-distro keeps the distro: version 5 in containers/<name>/rootfs, older ones in installed-rootfs/<name>.
# Asked each time, since the first login of version 5 moves an old one.
rootfs() {
  local base="$PREFIX/var/lib/proot-distro"
  if [ -n "${ORBIS_ROOTFS:-}" ]; then
    echo "$ORBIS_ROOTFS"
  elif [ ! -d "$base/containers/$DISTRO/rootfs" ] && [ -d "$base/installed-rootfs/$DISTRO" ]; then
    echo "$base/installed-rootfs/$DISTRO"
  else
    echo "$base/containers/$DISTRO/rootfs"
  fi
}

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() {
  printf 'orbis-phone: %s\n' "$*" >&2
  [ -d "$STATE" ] && printf '%s orbis-phone: %s\n' "$(date '+%F %T')" "$*" >>"$STATE/hub.log"
  exit 1
}

# A command inside Debian, with Node.js on the PATH. Its environment starts empty: Termux's own
# (PREFIX, which npm takes for its install folder; LD_PRELOAD; TMPDIR) means nothing in Debian.
# Only a proxy and its certificates, when set, go along.
distro() {
  local -a pass=()
  local name
  for name in HTTPS_PROXY HTTP_PROXY NO_PROXY https_proxy http_proxy no_proxy NODE_EXTRA_CA_CERTS npm_config_cafile GIT_SSL_CAINFO CURL_CA_BUNDLE SSL_CERT_FILE; do
    [ -n "${!name:-}" ] && pass+=("$name=${!name}")
  done
  proot-distro login "$DISTRO" --shared-tmp -- /usr/bin/env -i \
    PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/root LANG=C.UTF-8 TERM="${TERM:-xterm-256color}" npm_config_update_notifier=false "${pass[@]}" "$@"
}

healthy() { curl -fsS -m 3 --noproxy "*" -o /dev/null "http://127.0.0.1:$PORT/health" 2>/dev/null; }
# Whether the running hub takes this token (a cheap signed-in request).
accepts() { curl -fsS -m 3 --noproxy "*" -o /dev/null -H "Authorization: Bearer $1" "http://127.0.0.1:$PORT/api/v1/voice" 2>/dev/null; }

# The Orbis app starts the hub through Termux's RUN_COMMAND, which Termux allows only when told so.
allow_external_apps() {
  local file="$HOME/.termux/termux.properties"
  mkdir -p "$HOME/.termux"
  if ! grep -Eq '^[[:space:]]*allow-external-apps[[:space:]]*=[[:space:]]*true' "$file" 2>/dev/null; then
    [ -f "$file" ] && sed -i '/^[[:space:]]*#*[[:space:]]*allow-external-apps/d' "$file"
    echo "allow-external-apps = true" >>"$file"
  fi
  command -v termux-reload-settings >/dev/null 2>&1 && termux-reload-settings >/dev/null 2>&1 || true
}

# What runs inside Debian to install or update Node.js, Orbis and Claude Code.
# shellcheck disable=SC2016 # expanded inside Debian, from the variables handed to it
INNER_INSTALL='
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "▸ Debian: packages"
apt-get update -q
# pipx: the MCP servers written in Python (Instagram, Google Analytics) start with `pipx run`.
apt-get install -y -q --no-install-recommends ca-certificates curl git xz-utils procps python3 pipx >/dev/null
case "$(uname -m)" in
  aarch64 | arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  armv7l | armv8l) arch=armv7l ;;
  *) echo "this phone ($(uname -m)) has no Node.js build" >&2; exit 1 ;;
esac
if ! /opt/node/bin/node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  echo "▸ Node.js $NODE_MAJOR ($arch)"
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  line="$(curl -fsSL "$base/SHASUMS256.txt" | grep -E " node-v[0-9.]+-linux-$arch\.tar\.xz$")"
  file="${line##* }"
  curl -fsSLo /tmp/node.tar.xz "$base/$file"
  echo "${line%% *}  /tmp/node.tar.xz" | sha256sum -c - >/dev/null
  rm -rf /opt/node && mkdir -p /opt/node
  tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
  rm -f /tmp/node.tar.xz
fi
echo "▸ Orbis"
if [ -d "$APP/.git" ]; then
  # A copy only ever updated, never edited here: take the branch as it is now, even after a force-push.
  git -C "$APP" remote set-url origin "$REPO"
  branch="${BRANCH:-$(git -C "$APP" rev-parse --abbrev-ref HEAD)}"
  git -C "$APP" fetch -q --depth 1 origin "$branch"
  git -C "$APP" reset -q --hard FETCH_HEAD
else
  git clone -q --depth 1 ${BRANCH:+--branch "$BRANCH"} "$REPO" "$APP"
fi
cd "$APP"
echo "▸ Orbis: install and build (a few minutes the first time)"
log=/root/orbis-build.log
step() { "$@" >>"$log" 2>&1 || { tail -n 30 "$log" >&2; echo "failed: $* (whole log: $log)" >&2; exit 1; }; }
: >"$log"
step env ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund
step npm run build
step npm prune --omit=dev --ignore-scripts --no-audit --no-fund
echo "▸ Claude Code"
npm install -g --no-audit --no-fund --loglevel=error @anthropic-ai/claude-code >/dev/null 2>&1 || true
if ! timeout 60 claude --version >/dev/null 2>&1; then
  echo "  its native build does not run on this phone: installing $CLAUDE_JS_VERSION, in JavaScript"
  npm install -g --no-audit --no-fund --loglevel=error "@anthropic-ai/claude-code@$CLAUDE_JS_VERSION" >/dev/null
fi
echo "  $(claude --version)"
'

install_wrapper() {
  local bin="$PREFIX/bin/orbis-phone"
  # The script lives in the Orbis checkout inside Debian, updated with it. Where Debian is, is looked up each run.
  cat >"$bin" <<EOF
#!$PREFIX/bin/bash
for base in "$PREFIX/var/lib/proot-distro/containers/$DISTRO/rootfs" "$PREFIX/var/lib/proot-distro/installed-rootfs/$DISTRO"; do
  script="\$base$APP/scripts/android/orbis-termux.sh"
  [ -f "\$script" ] && exec bash "\$script" "\$@"
done
echo "orbis-phone: Orbis is not installed on this phone: run bash orbis-termux.sh (docs/android.md)" >&2
exit 127
EOF
  chmod 755 "$bin"
}

cmd_install() {
  mkdir -p "$STATE"
  chmod 700 "$STATE"
  printf 'ORBIS_REPO=%q\nORBIS_BRANCH=%q\nORBIS_DISTRO=%q\n' "$REPO" "$BRANCH" "$DISTRO" >"$STATE/config"
  say "Termux: packages"
  # Termux wants its packages up to date before new ones; keep any config file the user changed.
  local confold=(-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
  apt-get update -q >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get -y -q "${confold[@]}" full-upgrade >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get -y -q "${confold[@]}" install proot-distro curl procps >/dev/null
  allow_external_apps
  # A copy that never finished (no /root) is removed: proot-distro will not install over it.
  if [ -d "$(rootfs)" ] && [ ! -d "$(rootfs)/root" ]; then
    say "Debian: a broken copy is there, installing it again"
    proot-distro remove "$DISTRO"
  fi
  if [ ! -d "$(rootfs)/root" ]; then
    say "Debian (proot-distro)"
    proot-distro install "$DISTRO"
  fi
  printf '%s\n' "$INNER_INSTALL" | distro NODE_MAJOR="$NODE_MAJOR" REPO="$REPO" BRANCH="$BRANCH" APP="$APP" CLAUDE_JS_VERSION="$CLAUDE_JS_VERSION" bash -s
  install_wrapper
  echo
  say "Orbis is on this phone."
  echo "  Open the Orbis app and tap \"Use Orbis on this phone\": it starts the hub here."
  echo "  From Termux: orbis-phone serve (Ctrl+C stops it) · orbis-phone status · orbis-phone update"
  echo "  Keep it running: in Android's settings, let Termux run without battery limits."
}

stop_hub() {
  pkill -f "$SERVE_MATCH" 2>/dev/null || true
  distro pkill -f "$SERVE_MATCH" 2>/dev/null || true
  for _ in $(seq 1 20); do
    healthy || return 0
    sleep 0.5
  done
  die "the hub on port $PORT did not stop"
}

cmd_serve() {
  local token="" awake=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --token-stdin) IFS= read -r token || true ;;
      --awake) awake=1 ;;
      *) die "unknown option for serve: $1" ;;
    esac
    shift
  done
  mkdir -p "$STATE"
  chmod 700 "$STATE"
  # The app owns the hub's token: it hands it over each start, and a manual start reuses the last one.
  if [ -n "$token" ]; then
    (umask 077 && printf '%s' "$token" >"$STATE/token")
  elif [ -f "$STATE/token" ]; then
    token="$(cat "$STATE/token")"
  fi
  if healthy; then
    if [ -z "$token" ] || accepts "$token"; then
      say "Orbis is already running on http://127.0.0.1:$PORT"
      return 0
    fi
    say "Orbis runs with another token: starting it again with the app's"
    stop_hub
  fi
  [ -f "$(rootfs)$APP/packages/cli/dist/index.js" ] || die "Orbis is not installed on this phone: run bash orbis-termux.sh (docs/android.md)"
  # Bots answer and routines fire with the screen off only while the CPU stays awake: the hub holds Termux's
  # wake lock while it runs (ORBIS_AWAKE=0 to let the phone sleep; --awake is the default and kept for old apps).
  if [ -n "$awake" ] || [ "${ORBIS_AWAKE:-1}" != 0 ]; then
    termux-wake-lock 2>/dev/null || true
    trap 'termux-wake-unlock 2>/dev/null || true' EXIT
  fi
  # Keep the log short: the last ~2 MB.
  if [ -f "$STATE/hub.log" ] && [ "$(wc -c <"$STATE/hub.log")" -gt 4000000 ]; then
    tail -c 2000000 "$STATE/hub.log" >"$STATE/hub.log.tmp" && mv "$STATE/hub.log.tmp" "$STATE/hub.log"
  fi
  say "Orbis on http://127.0.0.1:$PORT (this phone only)"
  local -a env=(ORBIS_HOST=127.0.0.1 ORBIS_PORT="$PORT")
  [ -n "$token" ] && env+=(ORBIS_TOKEN="$token")
  if [ -t 1 ]; then
    distro "${env[@]}" node "$APP/packages/cli/dist/index.js" serve --quiet 2>&1 | tee -a "$STATE/hub.log"
  else
    distro "${env[@]}" node "$APP/packages/cli/dist/index.js" serve --quiet >>"$STATE/hub.log" 2>&1
  fi
}

cmd_status() {
  if healthy; then
    say "Orbis is running on http://127.0.0.1:$PORT"
  else
    say "Orbis is stopped"
  fi
  if [ -f "$(rootfs)$APP/packages/cli/dist/index.js" ]; then
    echo "  Claude Code: $(distro claude --version 2>/dev/null || echo "not installed")"
  else
    echo "  Not installed: bash orbis-termux.sh"
  fi
}

cmd_token() {
  local token=""
  if [ -f "$STATE/token" ]; then token="$(cat "$STATE/token")"; elif [ -f "$(rootfs)/root/.orbis/token" ]; then token="$(cat "$(rootfs)/root/.orbis/token")"; fi
  [ -n "$token" ] || die "no token yet: start the hub first (open the Orbis app, or orbis-phone serve)"
  echo "$token"
  echo "http://127.0.0.1:$PORT/#token=$token"
}

# Without the app's RUN_COMMAND permission: start the hub from here, then hand the app its sign-in link
# (the app takes the token from a shared link, as it does from the computer's launcher).
cmd_open() {
  if ! healthy; then
    say "Starting Orbis (the first time takes a minute or two)"
    nohup bash "${BASH_SOURCE[0]}" serve --awake >/dev/null 2>&1 &
    local up=""
    for _ in $(seq 1 180); do
      healthy && up=1 && break
      sleep 1
    done
    [ -n "$up" ] || die "the hub did not answer in 3 minutes: orbis-phone logs"
  fi
  local link
  link="$(cmd_token | sed -n 2p)"
  [ -n "$link" ] || die "the hub has no token yet: orbis-phone logs"
  if command -v am >/dev/null 2>&1 &&
    am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "$link" -n app.orbis.android/.MainActivity >/dev/null 2>&1; then
    say "Orbis is open on the phone."
  else
    say "Open this link on the phone to sign in:"
    echo "  $link"
  fi
}

# The hub's own CLI, inside Debian, signed in to this phone's hub with its token.
cmd_cli() {
  healthy || die "the hub is not running: open the Orbis app, or orbis-phone open"
  local token
  token="$(cmd_token | sed -n 1p)"
  distro ORBIS_URL="http://127.0.0.1:$PORT" ORBIS_TOKEN="$token" node "$APP/packages/cli/dist/index.js" "$@"
}

cmd_update() {
  local running=""
  healthy && running=1
  cmd_install
  if [ -n "$running" ]; then
    stop_hub
    say "Stopped the old hub: open the Orbis app to start the new one."
  fi
}

case "${1:-install}" in
  install) cmd_install ;;
  serve) shift && cmd_serve "$@" ;;
  stop) stop_hub && say "Orbis stopped" ;;
  status) cmd_status ;;
  logs) tail -n 200 "$STATE/hub.log" 2>/dev/null || echo "no log yet" ;;
  update) cmd_update ;;
  token) cmd_token ;;
  open) cmd_open ;;
  setup-token) distro claude setup-token ;;
  link) shift && cmd_cli link "$@" ;;
  unlink) cmd_cli unlink ;;
  -h | --help | help) sed -n '2,20p' "${BASH_SOURCE[0]}" ;;
  *) die "unknown command: $1 (orbis-phone help)" ;;
esac
