#!/usr/bin/env bash
# Stop API, repair institution data overnight, restart API automatically.
#
# Usage (on Hetzner):
#   bash backend/scripts/run-overnight-institution-maintenance.sh
#   bash backend/scripts/run-overnight-institution-maintenance.sh --dry-run
#   bash backend/scripts/run-overnight-institution-maintenance.sh --fetch-sec
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kensigline}"
LOG_DIR="${LOG_DIR:-/var/log/kensigline}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/institution-maintenance-${STAMP}.log"
PID_FILE="${LOG_DIR}/institution-maintenance.pid"
EXTRA_ARGS=("$@")

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

if [[ -f .env ]]; then
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "\"'")"
  export DATABASE_URL
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Maintenance already running (pid $(cat "$PID_FILE"))" >&2
  exit 1
fi

echo $$ >"$PID_FILE"

restart_services() {
  echo "[wrapper] restarting kensigline-backend" | tee -a "$LOG_FILE"
  systemctl start kensigline-backend 2>&1 | tee -a "$LOG_FILE" || true
  sleep 2
  systemctl is-active kensigline-backend 2>&1 | tee -a "$LOG_FILE" || true
  curl -sf http://127.0.0.1:3001/health 2>&1 | tee -a "$LOG_FILE" || echo "[wrapper] health check pending" | tee -a "$LOG_FILE"
  rm -f "$PID_FILE"
}

trap restart_services EXIT

{
  echo "[wrapper] start $(date -Is) args=${EXTRA_ARGS[*]:-}"
  echo "[wrapper] stopping kensigline-backend"
  systemctl stop kensigline-backend || true
  systemctl stop kensigline-workers 2>/dev/null || true
  systemctl stop kensigline-worker 2>/dev/null || true
  sleep 2

  echo "[wrapper] running maintenance"
  npx tsx backend/src/scripts/overnight-institution-maintenance.ts "${EXTRA_ARGS[@]}"

  echo "[wrapper] finished $(date -Is)"
} 2>&1 | tee -a "$LOG_FILE"
