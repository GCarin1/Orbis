#!/usr/bin/env bash
# Orbis on a server that stays on (docs/server.md, ADR 0026): the hub, the web app, Claude Code and Chromium
# in Docker on an always-on Linux machine — such as Oracle Cloud's Always Free ARM VM — with Caddy in front for
# HTTPS. Open https://<its address> anywhere, sign in with your account; the phone is only a screen and Termux
# is not needed. The first time, on the server (Ubuntu 22.04 or 24.04, arm64 or x86-64):
#
#   curl -fsSLo orbis-server.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/server/orbis-server.sh && bash orbis-server.sh install
#
# Afterwards, `orbis-server <command>`:
#   install   Docker, Orbis, its settings (deploy/.env), the firewall (80 and 443) and the hub with HTTPS
#   link      make this server's hub a device of your Orbis account (email and password at prompts): its
#             data is kept in the account too; `link --status` shows it
#   unlink    leave the account: the device's token stops working
#   token     the hub's token: the recovery key that signs in without the account (keep it safe)
#   import F  bring a .orbis file exported elsewhere (the phone: Settings → Data) into this hub
#             (--password: the export's password, for its secrets)
#   status    whether the hub and Caddy run, and the device it is in your account
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
  sed -n '9,20p' "$0" | sed 's/^# \{0,1\}//'
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

# Oracle's Ubuntu images refuse every port but SSH in iptables: open 80 (the certificate) and 443 (Orbis).
open_ports() {
  command -v iptables >/dev/null 2>&1 || return 0
  local port
  for port in 80 443; do
    as_root iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || as_root iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  as_root iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || as_root iptables -I INPUT 1 -p udp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null 2>&1; then as_root netfilter-persistent save >/dev/null 2>&1 || true; fi
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
    local domain ip claude tz
    # Without a domain of your own, <public IP>.sslip.io points at this server and gets a certificate too.
    ip="${ORBIS_PUBLIC_IP:-$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)}"
    domain="$(ask ORBIS_DOMAIN "Address to open Orbis at [${ip:+${ip//./-}.sslip.io}]: ")"
    [ -z "$domain" ] && [ -n "$ip" ] && domain="${ip//./-}.sslip.io"
    [ -n "$domain" ] || die "no address: give ORBIS_DOMAIN (your domain, or <public-ip-with-dashes>.sslip.io)"
    claude="$(ask CLAUDE_CODE_OAUTH_TOKEN "Your Claude plan's token from \`claude setup-token\` (Enter to skip): " secret)"
    tz="${TZ:-America/Sao_Paulo}"
    (
      umask 077
      {
        echo "# Orbis on this server (docs/server.md). Never commit this file."
        echo "ORBIS_DOMAIN=$domain"
        echo "ORBIS_PUBLIC_URL=https://$domain"
        echo "CLAUDE_CODE_OAUTH_TOKEN=$claude"
        echo "TZ=$tz"
        echo "ORBIS_PORT=7420"
      } >"$env"
    )
  fi
  chmod 600 "$env"

  say "Firewall: ports 80 and 443"
  open_ports

  say "The hub and HTTPS (the first build takes a few minutes)"
  compose --profile https up -d --build

  # This script as a command, for the next times.
  as_root install -m 0755 "$DIR/scripts/server/orbis-server.sh" "$BIN" 2>/dev/null || true
  local url
  url="$(grep -E '^ORBIS_PUBLIC_URL=' "$env" | cut -d= -f2-)"
  say "Done. Open $url — sign in with: orbis-server token (then link your account in Settings → Account)"
  say "In Oracle Cloud, allow ingress TCP 80 and 443 in the VM's subnet security list (docs/server.md)."
}

cmd_link() {
  if [ "${1:-}" = "--status" ] || [ "${1:-}" = "--sync" ]; then
    cli link "$@"
    return
  fi
  cli link --name "${ORBIS_DEVICE_NAME:-Orbis — servidor}" "$@"
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
  compose --profile https up -d --build
}

case "${1:-}" in
  install) shift; cmd_install "$@" ;;
  link) shift; cmd_link "$@" ;;
  unlink) shift; cli unlink "$@" ;;
  token) compose exec -T orbis cat /data/token ;;
  import) shift; cmd_import "$@" ;;
  status) cmd_status ;;
  logs) shift; compose --profile https logs --tail 200 "$@" ;;
  update) cmd_update ;;
  stop) compose stop orbis ;;
  start) compose --profile https up -d ;;
  help | -h | --help | "") usage ;;
  *) usage >&2; exit 2 ;;
esac
