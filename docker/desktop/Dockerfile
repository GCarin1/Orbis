# orbis/desktop — the computer of a bot under the docker provider (ADR 0005,
# specs/computer): a virtual screen with a window manager, Chromium with a
# DevTools relay for the hub's browser tools, and noVNC for the live view and
# takeover.
#
#   docker build -t orbis/desktop:latest docker/desktop
#
# Ports (published by the hub on 127.0.0.1 only): 6080 noVNC, 9223 DevTools.
# The bot's workspace is bind-mounted at /home/orbis/workspace; the rest of
# /home/orbis (browser profile, desktop settings) lives in the bot's volume.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    DISPLAY=:0 \
    SCREEN_GEOMETRY=1280x800x24

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini xvfb fluxbox x11vnc novnc websockify socat \
      chromium fonts-liberation fonts-noto-color-emoji \
      ca-certificates curl git python3 procps coreutils less nano \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 --shell /bin/bash orbis \
 && mkdir -p /home/orbis/workspace \
 && chown -R orbis:orbis /home/orbis

COPY --chmod=0755 entrypoint.sh /usr/local/bin/orbis-desktop

USER orbis
WORKDIR /home/orbis/workspace
EXPOSE 6080 9223
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/orbis-desktop"]
