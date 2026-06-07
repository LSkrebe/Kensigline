# Discover tab

Cross-ticker calendar for the Discover frontend: **Ahead** (upcoming) and **Recent** (past).

## API

| Route | Description |
|-------|-------------|
| `GET /api/discover/timeline` | Aggregated upcoming + past events |

Query params:

| Param | Default | Description |
|-------|---------|-------------|
| `q` / `query` | — | Search ticker, company, title, summary, mentioned symbols |
| `sources` / `source_keys` | all | Comma-separated document-type ids (`8-K`, `Form 4`, …) |
| `past_days` | 90 | Recent window |
| `ahead_days` | 180 | Upcoming window |
| `limit` | 120 | Max rows per column (before client display) |

## Data sources

| Column | Source |
|--------|--------|
| **Recent** | `documents` (research + pharma analysis, investigate flow docs) |
| **Ahead — earnings** | `companies.earnings_date` |
| **Ahead — trials** | ClinicalTrials.gov via `research/clinical/trials.ts` (clinical tickers) |
| **Ahead — scheduled** | Future-dated `documents` rows |

## Mentioned tickers (Recent)

Resolved in order:

1. `documents.data.related_tickers` from LLM extract (new parses)
2. Curated peer hints in `peers.ts`
3. Ticker symbols parsed from analysis text

## Env

| Variable | Default | Role |
|----------|---------|------|
| `DISCOVER_MAX_UNIVERSE` | 500 | Ticker universe cap |
| `DISCOVER_CLINICAL_TICKERS` | 12 | CT.gov lookups per timeline request |

## Module map

| File | Role |
|------|------|
| `api.ts` | HTTP routes |
| `timeline.ts` | Orchestration, search/filter |
| `past.ts` | Recent SQL |
| `ahead.ts` | Upcoming earnings + catalysts |
| `map.ts` | Row → `DiscoverEvent` |
| `mentions.ts` | Upstream/downstream chains |
| `peers.ts` | Curated supply-chain hints |
| `types.ts` | Shared DTOs |

Shared catalog: `shared/source-keys.ts` (same ids as frontend `researchPaperSources.js`).
