# Orbis hub in a container (docs/cloud.md, ADR 0017): the hub, the web app,
# Claude Code and Chromium, for a server that stays on when your computer is off
# — a free cloud VM, a home server, a VPS.
#
#   docker build -t orbis .
#   docker run -d --name orbis -p 127.0.0.1:7420:7420 -v orbis-data:/data orbis
#
# Or deploy/docker-compose.yml, which can also put it on the internet through
# a Cloudflare tunnel. Everything that must survive an update — the database,
# the token, bot workspaces, Claude Code's sign-in and sessions — lives in /data.
# Claude Code runs on your Claude plan with the token `claude setup-token` prints
# (CLAUDE_CODE_OAUTH_TOKEN, or Settings → Brains → Claude Code), never on the API.

FROM node:22-bookworm-slim AS build
WORKDIR /src
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# The sources come first: npm runs the workspaces' `prepare` (tsc -b) even with scripts off.
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
ARG CLAUDE_CODE_VERSION=latest
# The bots' browser tools; `--build-arg BROWSER_PACKAGES=` leaves them out for a smaller image.
ARG BROWSER_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji"
ENV DEBIAN_FRONTEND=noninteractive
# git, curl and python3 for the bots' commands; tini to stop cleanly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini ca-certificates curl git python3 ${BROWSER_PACKAGES} \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /data && chown node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /src /app

ENV NODE_ENV=production \
    ORBIS_HOST=0.0.0.0 \
    ORBIS_PORT=7420 \
    ORBIS_DATA_DIR=/data \
    ORBIS_BROWSER_EXECUTABLE=/usr/bin/chromium \
    CLAUDE_CONFIG_DIR=/data/claude

USER node
VOLUME ["/data"]
EXPOSE 7420
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:7420/health >/dev/null || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/packages/cli/dist/index.js", "serve"]
