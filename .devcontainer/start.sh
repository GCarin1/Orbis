#!/usr/bin/env bash
# Start the Orbis hub in this Codespace, once, and say where to open it (docs/cloud.md).
# Runs when the Codespace starts and when you open it; a hub already running is left alone.
#   bash .devcontainer/start.sh            start if needed, then show the address
#   bash .devcontainer/start.sh --quiet    start if needed
#   bash .devcontainer/start.sh --public   also make port 7420 public (the Android app needs it)
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${ORBIS_PORT:-7420}"
DATA="${ORBIS_DATA_DIR:-/workspaces/.orbis-data}"
mkdir -p "$DATA"
up() { curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; }

if ! up; then
  [ -f packages/cli/dist/index.js ] || npm run build >>"$DATA/build.log" 2>&1
  # Its own session, so it outlives the command that started the Codespace.
  setsid nohup node packages/cli/dist/index.js serve --quiet >>"$DATA/hub.log" 2>&1 </dev/null &
  for _ in $(seq 1 40); do up && break; sleep 1; done
fi

if [ "${1:-}" = "--public" ] && [ -n "${CODESPACE_NAME:-}" ]; then
  gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" \
    || echo "Could not change it from here: in the PORTS tab, right-click port $PORT → Port Visibility → Public."
fi
[ "${1:-}" = "--quiet" ] && exit 0

if ! up; then
  echo "Orbis did not start: see $DATA/hub.log"
  exit 1
fi
if [ -n "${CODESPACE_NAME:-}" ]; then
  ADDRESS="https://$CODESPACE_NAME-$PORT.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  ADDRESS="http://127.0.0.1:$PORT"
fi
echo
echo "  Orbis is running: $ADDRESS"
if [ -n "${ORBIS_TOKEN:-}" ]; then
  echo "  Token: the one you saved as the Codespaces secret ORBIS_TOKEN."
else
  echo "  Token: $(cat "$DATA/token" 2>/dev/null || echo "see $DATA/token")"
fi
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "  Claude: your plan's token (CLAUDE_CODE_OAUTH_TOKEN) is set."
else
  echo "  Claude: paste the token of 'claude setup-token' in Settings → Brains → Claude Code."
fi
echo "  Phone: open the address (or scan the QR code in Settings → Phone)."
echo "         For the Android app, make port $PORT public: bash .devcontainer/start.sh --public"
echo
