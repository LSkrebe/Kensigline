# Institutions mode (Investigate tab)

Frontend **institutions** mode reads live data from:

- `GET /api/institutions/feed` — one row per ticker (aggregated 13F activity)
- `GET /api/institutions/cluster/ticker:SYMBOL` — case worksheet for the selected company

## Pipeline

| File | Role |
|------|------|
| `worker.ts` | Enqueues SEC `13F-HR` / `13F-HR/A` filings (`sec_13f` queue type) |
| `parse-13f.ts` | Deterministic info-table parse (issuer, CUSIP, value, shares) |
| `resolve-13f-tickers.ts` | CUSIP/name → ticker + share-delta activity; learns `cusip_ticker_map` |
| `pipeline.ts` | Deterministic-first persist; LLM only if zero holdings map (`INSTITUTIONS_LLM_FALLBACK`) |

Research paper flows (`/api/research/explore` → `flows.filings13f`) read the same `institution_filings_13f` table via `documents/store.ts`.
