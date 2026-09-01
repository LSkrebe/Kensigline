#!/usr/bin/env bash
# Merge duplicate institution_transactions (same filing_id). NOT a 13F re-parse.
#
# Usage (on Hetzner):
#   bash backend/scripts/run-consolidate-institution-txns.sh
#   bash backend/scripts/run-consolidate-institution-txns.sh --dry-run
#   bash backend/scripts/run-consolidate-institution-txns.sh --slug=boston-research-management
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kensigline}"
LOG_DIR="${LOG_DIR:-/var/log/kensigline}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/consolidate-institution-txns-${STAMP}.log"
PID_FILE="${LOG_DIR}/consolidate-institution-txns.pid"
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
  echo "Consolidation already running (pid $(cat "$PID_FILE"))" >&2
  exit 1
fi

echo $$ >"$PID_FILE"

restart_services() {
  echo "[wrapper] restarting kensigline-backend" | tee -a "$LOG_FILE"
  systemctl start kensigline-backend 2>&1 | tee -a "$LOG_FILE" || true
  sleep 2
  systemctl is-active kensigline-backend 2>&1 | tee -a "$LOG_FILE" || true
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

  echo "[wrapper] running consolidate repair (parallel=4)"
  node --import backend/dist/load-env.js backend/dist/scripts/repair-consolidate-institution-txns.js --parallel=4 "${EXTRA_ARGS[@]}"

  if [[ " ${EXTRA_ARGS[*]} " != *" --dry-run "* ]] && [[ " ${EXTRA_ARGS[*]} " != *" --slug=* ]]; then
    echo "[wrapper] ensuring unique index (no-op if repair already did)"
    node --import backend/dist/load-env.js -e "
      import { ensureInstitutionTxnOnePerFilingIndex } from './backend/dist/investigate/institutions/institution-txn-guards.js';
      const r = await ensureInstitutionTxnOnePerFilingIndex();
      console.log('[wrapper] unique_index', r);
      process.exit(r.dupes > 0 ? 1 : 0);
    " || true
  fi

  echo "[wrapper] finished $(date -Is)"
} 2>&1 | tee -a "$LOG_FILE"
