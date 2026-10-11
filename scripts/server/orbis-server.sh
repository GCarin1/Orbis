#!/usr/bin/env bash
# Orbis on a server that stays on (docs/server.md, ADR 0025): the hub, the web app, Claude Code and Chromium
# in Docker on an always-on Linux machine — such as Oracle Cloud's Always Free ARM VM — linked to your Orbis
# account as a device. It reaches the Orbis cloud on its own (no port opened, no tunnel), so the phone is only
# a screen and Termux is not needed. The first time, on the server (Ubuntu 22.04 or 24.04, arm64 or x86-64):
#
#   curl -fsSLo orbis-server.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/server/orbis-server.sh && bash orbis-server.sh install
#
# Afterwards, `orbis-server <command>`:
#   install   Docker, Orbis, its settings (deploy/.env) and the hub, started and kept running
#   link      make this server's hub a device of your Orbis account (email and password at prompts) and
#             connect it to the Orbis cloud; `link --status` shows it
#   unlink    leave the account: the device's token stops working
#   import F  bring a .orbis file exported elsewhere (the phone: Settings → Data) into this hub
#             (--password: the export's password, for its secrets)
#   status    whether the hub runs, its device and its connection to the cloud
#   logs      the end of the hub's log (logs -f follows it)
#   update    pull the newest Orbis and rebuild the hub (the data stays in its volume)
#   stop | start   stop or start the hub
set -euo pipefail

DIR="${ORBIS_SERVER_DIR:-$HOME/orbis}"
REPO="${ORBIS_REPO:-https://github.com/GCarin1/Orbis.git}"
BRANCH="${ORBIS_BRANCH:-}"
BIN="${ORBIS_SERVER_BIN:-/usr/local/bin/orbis-server}"
CLI=(node /app/packages/cli/dist/index.js)

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() {
  printf 'orbis-server: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '9,19p' "$0" | sed 's/^# \{0,1\}//'
}

# sudo when not root (a fresh VM signs in as a user with sudo).
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

# docker, through sudo until the user's new group membership applies (the next sign-in).
dock() {
  if docker info >/dev/null 2>&1; then docker "$@"; else as_root docker "$@"; fi
}

compose() {
  [ -f "$DIR/deploy/docker-compose.yml" ] || die "Orbis is not installed in $DIR: run orbis-server install"
  (cd "$DIR/deploy" && dock compose "$@")
}

# The hub's own command line inside the container.
cli() {
  local tty=()
  [ -t 0 ] && [ -t 1 ] && tty=(-it)
  [ ${#tty[@]} -eq 0 ] && tty=(-T)
  compose exec "${tty[@]}" orbis "${CLI[@]}" "$@"
}

# A value for deploy/.env: the environment's, else asked at a prompt (hidden for secrets), else empty.
ask() {
  local name="$1" prompt="$2" secret="${3:-}" value="${!1:-}"
  if [ -z "$value" ] && [ -t 0 ]; then
    if [ -n "$secret" ]; then
      read -r -s -p "$prompt" value
      echo >&2
    else
      read -r -p "$prompt" value
    fi
  fi
  printf '%s' "$value"
}

cmd_install() {
  say "Docker"
  if ! command -v docker >/dev/null 2>&1; then
    # Docker's own installer (its official repository), for Ubuntu and Debian on arm64 and x86-64.
    curl -fsSL https://get.docker.com | as_root sh
    as_root usermod -aG docker "$(id -un)" || true
  fi
  command -v git >/dev/null 2>&1 || as_root apt-get install -y git

  say "Orbis in $DIR"
  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" pull --ff-only
  else
    git clone ${BRANCH:+--branch "$BRANCH"} "$REPO" "$DIR"
  fi

  local env="$DIR/deploy/.env"
  if [ ! -f "$env" ]; then
    say "Settings (deploy/.env)"
    local cloud claude tz
    cloud="$(ask ORBIS_CLOUD_URL "The Orbis cloud's address (https://orbis.<you>.workers.dev): ")"
    claude="$(ask CLAUDE_CODE_OAUTH_TOKEN "Your Claude plan's token from \`claude setup-token\` (Enter to skip): " secret)"
    tz="${TZ:-America/Sao_Paulo}"
    (
      umask 077
      {
        echo "# Orbis on this server (docs/server.md). Never commit this file."
        echo "ORBIS_CLOUD_URL=$cloud"
        echo "CLAUDE_CODE_OAUTH_TOKEN=$claude"
        echo "TZ=$tz"
        echo "ORBIS_PORT=7420"
      } >"$env"
    )
  fi
  chmod 600 "$env"

  say "The hub (the first build takes a few minutes)"
  compose up -d --build orbis

  # This script as a command, for the next times.
  as_root install -m 0755 "$DIR/scripts/server/orbis-server.sh" "$BIN" 2>/dev/null || true
  say "Done. Next: orbis-server link   (your Orbis account's email and password)"
}

cmd_link() {
  if [ "${1:-}" = "--status" ] || [ "${1:-}" = "--sync" ]; then
    cli link "$@"
    return
  fi
  local cloud=()
  local url
  url="$(grep -E '^ORBIS_CLOUD_URL=' "$DIR/deploy/.env" 2>/dev/null | cut -d= -f2- || true)"
  [ -n "$url" ] && cloud=(--cloud "$url")
  cli link --name "${ORBIS_DEVICE_NAME:-Orbis — servidor}" "${cloud[@]}" "$@"
}

cmd_import() {
  local file="${1:-}"
  [ -n "$file" ] || die "orbis-server import <file.orbis> [--password]"
  [ -f "$file" ] || die "no such file: $file"
  shift
  say "Importing $file"
  compose cp "$file" orbis:/data/import.orbis
  local code=0
  cli data import /data/import.orbis "$@" || code=$?
  compose exec -T orbis rm -f /data/import.orbis
  return "$code"
}

cmd_status() {
  compose ps orbis
  cli link --status || true
}

cmd_update() {
  say "Pulling Orbis"
  git -C "$DIR" pull --ff-only
  say "Rebuilding the hub"
  compose up -d --build orbis
}

case "${1:-}" in
  install) shift; cmd_install "$@" ;;
  link) shift; cmd_link "$@" ;;
  unlink) shift; cli unlink "$@" ;;
  import) shift; cmd_import "$@" ;;
  status) cmd_status ;;
  logs) shift; compose logs --tail 200 "$@" orbis ;;
  update) cmd_update ;;
  stop) compose stop orbis ;;
  start) compose up -d orbis ;;
  help | -h | --help | "") usage ;;
  *) usage >&2; exit 2 ;;
esac
