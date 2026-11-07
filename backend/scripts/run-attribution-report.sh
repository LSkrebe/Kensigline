#!/usr/bin/env bash
# Daily attribution report — yesterday (UTC) + all-time funnel by source.
#
# Usage (on Hetzner):
#   bash backend/scripts/run-attribution-report.sh
#   bash backend/scripts/run-attribution-report.sh --to lukas.skrebe@gmail.com
#
# Cron example (once daily ~07:05 UTC):
#   5 7 * * * APP_DIR=/opt/kensigline bash /opt/kensigline/backend/scripts/run-attribution-report.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kensigline}"
LOG_DIR="${LOG_DIR:-/var/log/kensigline}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/attribution-report-${STAMP}.log"
EXTRA_ARGS=("$@")

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export DATABASE_SSL_REJECT_UNAUTHORIZED=1
export DATABASE_SSL_CA_FILE="${APP_DIR}/backend/certs/supabase-root-2021.crt"
export AI_RUNTIME_ENABLED=0

exec 9>"${LOG_DIR}/attribution-report.lock"
flock -n 9 || exit 0

echo "[attribution-report-wrapper] start ${STAMP}" | tee -a "$LOG_FILE"
node backend/dist/scripts/send-attribution-daily.js "${EXTRA_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
echo "[attribution-report-wrapper] done" | tee -a "$LOG_FILE"
