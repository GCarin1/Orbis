#!/bin/sh
# Start the desktop of a bot's computer and keep it running.
set -eu

mkdir -p "$HOME/.orbis-browser" "$HOME/workspace"

Xvfb "$DISPLAY" -screen 0 "$SCREEN_GEOMETRY" -nolisten tcp &
i=0
while [ ! -e /tmp/.X11-unix/X0 ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done

fluxbox >/tmp/fluxbox.log 2>&1 &
# VNC only inside the container; websockify serves noVNC and bridges to it.
x11vnc -display "$DISPLAY" -forever -shared -nopw -localhost -rfbport 5900 -quiet >/tmp/x11vnc.log 2>&1 &
websockify --web /usr/share/novnc 6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &

# Chromium listens for DevTools on 127.0.0.1 only; socat relays it on 9223 for
# the hub (published on the host's 127.0.0.1). The container is the sandbox.
(
  while true; do
    chromium --no-sandbox --no-first-run --no-default-browser-check --disable-dev-shm-usage \
      --user-data-dir="$HOME/.orbis-browser" --remote-debugging-port=9222 \
      --window-position=0,0 --window-size=1280,800 about:blank >/tmp/chromium.log 2>&1 || true
    sleep 1
  done
) &
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &

wait
