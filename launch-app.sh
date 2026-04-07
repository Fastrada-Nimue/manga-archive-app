#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="4173"
URL="http://localhost:${PORT}"

if ! pgrep -f "python3 -m http.server ${PORT}" >/dev/null 2>&1; then
  nohup python3 -m http.server "${PORT}" --directory "${APP_DIR}" >/tmp/manga-archive-http.log 2>&1 &
  sleep 0.4
fi

xdg-open "${URL}"
