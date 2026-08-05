## Database schema

Single source of truth: **`schema.sql`**. Full reset — drops all app tables and recreates them empty. No migration files.

### Local (Docker)

```bash
cd backend
docker compose up -d
psql "postgres://postgres:postgres@localhost:5432/postgres" -f db/schema.sql
```

### Supabase

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
```

Use pooler URL from `.env`. If TLS fails locally, set `PGSSLMODE=require` or use Supabase SQL Editor and paste `schema.sql`.

### Tables

| Layer | Tables |
|--------|--------|
| Core | `companies`, `bars`, `billing_accounts`, `outcomes` |
| Ingest | `document_queue`, `ingest_cursors` |
| Paper | `documents` |
| Flows | `insider_transactions`, `politician_transactions`, `institution_filings_13f` |
| Alerts | `alert_preferences`, `alert_digest_log`, `alert_watchlist`, `alert_actor_watchlist` |

Clinical, gov-contract, and research-memo data lives on `documents` (`feed_kind`, `program_*`, `source_key`).

### Content-only reset (keep users & billing)

```bash
cd backend
npx tsx src/scripts/reset-content-data.ts
```

Clears documents, queues, bars, companies, outcomes, caches, and alert *send* logs. Keeps `billing_accounts`, alert preferences, watchlists, and `politician_committee_lookup`.

Politician committee lookup (`politician_committee_lookup`) is refreshed automatically by the API workers when stale (about weekly).
