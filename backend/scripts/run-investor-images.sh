#!/usr/bin/env bash
set -euo pipefail
cd /opt/kensigline/backend
mkdir -p /var/log/kensigline
exec 9>/var/log/kensigline/investor-images.lock
flock -n 9 || exit 0
export DATABASE_SSL_REJECT_UNAUTHORIZED=1
export DATABASE_SSL_CA_FILE=/opt/kensigline/backend/certs/supabase-root-2021.crt
export AI_RUNTIME_ENABLED=0
export IMAGE_REFRESH_LIMIT=60
node dist/scripts/refresh-investor-images.js
