## Database schema (local)

This folder contains the current **minimal Postgres schema** used by Kensigline.

### Apply schema

Start Postgres (repo provides a compose file):

```bash
cd backend
docker compose up -d
```

Apply the schema:

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
```

### Tables (high level)

- **`document_queue`**: URL ingestion queue + retry/status tracking.
- **`document_parsed`**: parsed output from Qwen as a single `jsonb` blob (`data`) plus a few helper columns for feed/program queries.
- **`companies`**: data for the Company panel and joins/grouping.
- **`bars`**: close-only daily time series (sparkline input).
- **`outcomes`**: Historical Outcomes panel payloads.

