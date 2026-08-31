#!/usr/bin/env bash
set -euo pipefail
cd /opt/kensigline
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "\"'")"
DATABASE_URL="${DATABASE_URL/:6543/:5432}"

echo "[cleanup] terminating stale institution_transactions queries (>5min)"
psql "$DATABASE_URL" -c "
SELECT pid, now()-query_start AS runtime, left(query, 70) AS q
FROM pg_stat_activity
WHERE state = 'active'
  AND query ILIKE '%institution_transactions%'
  AND query NOT ILIKE '%pg_stat_activity%'
  AND now()-query_start > interval '5 minutes';
"

psql "$DATABASE_URL" -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND query ILIKE '%institution_transactions%'
  AND query NOT ILIKE '%pg_stat_activity%'
  AND now()-query_start > interval '5 minutes';
"

set +e
pkill -f overnight-institution-maintenance
pkill -f "tsx backend/src/scripts/overnight"
sleep 2

rm -f /var/log/kensigline/institution-maintenance.pid
nohup bash backend/scripts/run-overnight-institution-maintenance.sh >> /var/log/kensigline/maintenance-launch.log 2>&1 &
echo "[cleanup] restarted maintenance"
