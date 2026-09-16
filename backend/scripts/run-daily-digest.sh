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

# Use the same verified DB connection and deterministic runtime as the API.
export DATABASE_SSL_REJECT_UNAUTHORIZED=1
export DATABASE_SSL_CA_FILE="${APP_DIR}/backend/certs/supabase-root-2021.crt"
export AI_RUNTIME_ENABLED=0
# Prevent overlapping hourly invocations from delivering the same brief twice.
exec 9>"${LOG_DIR}/digest.lock"
flock -n 9 || exit 0

echo "[digest-wrapper] start ${STAMP}" | tee -a "$LOG_FILE"
node backend/dist/scripts/send-daily-digest.js "${EXTRA_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
echo "[digest-wrapper] done" | tee -a "$LOG_FILE"
