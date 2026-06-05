# Backend layout

Mirrors the frontend terminal tabs and mode switches.

| Frontend | Backend folder | API prefix |
|----------|----------------|------------|
| **Research** tab | `research/` | `/api/research/*`, `/api/pharma/*`, `/api/main/trends` |
| — market intel | `research/market/` | (same) |
| — clinical intel | `research/clinical/` | `/api/pharma/*` |
| **Investigate** tab | `investigate/` | `/api/insider/*`, `/api/politicians/*`, `/api/institutions/*` |
| **Settings** tab | `billing/` + `core/supabase-auth.ts` | `/api/billing/*`, `/api/auth/*` |
| Shared platform | `core/` | `/api/bars`, `/api/company`, `/api/outcomes`, `/api/stats` |

## Cross-cutting modules

| Path | Role |
|------|------|
| `documents/` | Document store, LLM extract, explore/paper presentation, env spec |
| `shared/` | JSON helpers, money formatting, queue utils, worker factory, feed helpers |
| `pipelines/registry.ts` | Queue source types + `feed_kind` constants |
| `server/workers.ts` | Starts/stops all background workers |
| `investigate/api.ts` | Investigate tab HTTP routes (insider, politicians, institutions) |
| `research/api.ts` | Research tab HTTP routes |

Entry point: `index.ts` — thin HTTP router; delegates tab routes to `research/api.ts` and `investigate/api.ts`.
