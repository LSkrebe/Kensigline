# Institutions mode (Investigate tab)

Frontend **institutions** mode reads live data from:

- `GET /api/institutions/feed` — one row per ticker (aggregated 13F activity)
- `GET /api/institutions/cluster/ticker:SYMBOL` — case worksheet for the selected company

## Pipeline

| File | Role |
|------|------|
| `worker.ts` | Enqueues SEC `13F-HR` / `13F-HR/A` filings (`sec_13f` queue type) |
| `pipeline.ts` | Parses filings → `documents` (`feed_kind=institutions`) + `institution_filings_13f` |

Research paper flows (`/api/research/explore` → `flows.filings13f`) read the same `institution_filings_13f` table via `documents/store.ts`.
