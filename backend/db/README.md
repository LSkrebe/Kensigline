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
| Ingest | `document_queue` |
| Paper | `documents` |
| Flows | `insider_transactions`, `politician_transactions`, `institution_filings_13f` |
| Clinical | `clinical_programs`, `clinical_milestones`, `clinical_catalysts` |
| Gov | `gov_contract_awards`, `gov_contract_ticker_links` |
| Research | `ticker_feed_state`, `research_memos` |