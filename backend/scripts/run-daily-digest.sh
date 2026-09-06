#!/usr/bin/env bash
# Hourly digest runner — sends when each user's local morning_hour matches.
#
# Usage (on Hetzner):
#   bash backend/scripts/run-daily-digest.sh
#   bash backend/scripts/run-daily-digest.sh --test lukas.skrebe@gmail.com
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kensigline}"
LOG_DIR="${LOG_DIR:-/var/log/kensigline}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/digest-${STAMP}.log"
EXTRA_ARGS=("$@")

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[digest-wrapper] start ${STAMP}" | tee -a "$LOG_FILE"
node backend/dist/scripts/send-daily-digest.js "${EXTRA_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
echo "[digest-wrapper] done" | tee -a "$LOG_FILE"
