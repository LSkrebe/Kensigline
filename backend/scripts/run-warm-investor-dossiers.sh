#!/usr/bin/env bash
# Prefetch curated Explore investor dossiers into investor_dossier_cache.
# Run daily (and after ingest spikes) so opens are cache hits.
#
# Usage (on Hetzner):
#   bash backend/scripts/run-warm-investor-dossiers.sh
#   bash backend/scripts/run-warm-investor-dossiers.sh --only=mark-zuckerberg,nancy-pelosi
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kensigline}"
LOG_DIR="${LOG_DIR:-/var/log/kensigline}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/warm-dossiers-${STAMP}.log"
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

exec 9>"${LOG_DIR}/warm-dossiers.lock"
flock -n 9 || exit 0

echo "[warm-dossiers-wrapper] start ${STAMP}" | tee -a "$LOG_FILE"
node backend/dist/scripts/warm-investor-dossiers.js "${EXTRA_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
echo "[warm-dossiers-wrapper] done" | tee -a "$LOG_FILE"
