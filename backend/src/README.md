# Backend layout

Mirrors the frontend terminal tabs and mode switches.

| Frontend | Backend folder | API prefix |
|----------|----------------|------------|
| **Research** tab | `research/` | `/api/research/*`, `/api/pharma/*`, `/api/main/trends` |
| — market intel | `research/market/` | (same) |
| — clinical intel | `research/clinical/` | `/api/pharma/*` |
| **Discover** tab | `discover/` | `/api/discover/*` |
| **Investigate** tab | `investigate/` | `/api/insider/*`, `/api/politicians/*`, `/api/institutions/*` |
| **Settings** tab | `billing/` + `core/supabase-auth.ts` | `/api/billing/*`, `/api/auth/*` |
| Shared platform | `core/` | `/api/bars`, `/api/company`, `/api/outcomes`, `/api/stats` |

`/api/company?ticker=` includes `fundamentals` (4-period SEC XBRL series + document guidance via `research/market/fundamentals.ts`) and `ownership` (13F + Form 3/5 via `research/market/ownership.ts`).

`/api/pharma/clinical-context?ticker=` includes `runway` for the clinical CONTEXT panel (cash, burn, runway from SEC Company Facts).

## Cross-cutting modules

| Path | Role |
|------|------|
| `documents/` | Document store, LLM extract, explore/paper presentation, env spec |
| `shared/` | JSON helpers, money formatting, queue utils, worker factory, feed helpers |
| `pipelines/registry.ts` | Queue source types + `feed_kind` constants |
| `server/workers.ts` | Starts/stops all background workers |
| `investigate/api.ts` | Investigate tab HTTP routes (insider, politicians, institutions) |
| `discover/api.ts` | Discover tab HTTP routes |
| `research/api.ts` | Research tab HTTP routes |
| `shared/source-keys.ts` | Document source catalog + normalization (Research + Discover filters) |

Entry point: `index.ts` — thin HTTP router; delegates tab routes to `research/api.ts`, `discover/api.ts`, and `investigate/api.ts`.
