# Discover tab

Cross-ticker calendar for the Discover frontend: **Ahead** (upcoming) and **Recent** (past).

## API

| Route | Description |
|-------|-------------|
| `GET /api/discover/timeline` | Aggregated upcoming + past events, macro week, and move reactions |

Query params:

| Param | Default | Description |
|-------|---------|-------------|
| `q` / `query` | — | Search ticker, company, title, summary, mentioned symbols |
| `sources` / `source_keys` | all | Comma-separated document-type ids (`8-K`, `Form 4`, …) |
| `past_days` | 90 | Recent window |
| `ahead_days` | 180 | Upcoming window |
| `limit` | 120 | Max rows per column (before client display) |
| `macro_days` | 5 | Business days in macro calendar column |

Response also includes:

| Field | Description |
|-------|-------------|
| `macro` | Upcoming macro release week (business-day templates) |
| `moves` | Map of past event id → `{ movePct, closes }` for Market Moves sparklines |

## Data sources

| Column | Source |
|--------|--------|
| **Recent** | `documents` (research + pharma analysis, investigate flow docs) |
| **Ahead — earnings** | `companies.earnings_date` |
| **Ahead — trials** | ClinicalTrials.gov via `research/clinical/trials.ts` (clinical tickers) |
| **Ahead — scheduled** | Future-dated `documents` rows (research/pharma/press) |

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
| `DISCOVER_MOVE_MAX` | 36 | Max past events with move/chart enrichment per request |

## Module map

| File | Role |
|------|------|
| `api.ts` | HTTP routes |
| `timeline.ts` | Orchestration, search/filter |
| `past.ts` | Recent SQL |
| `ahead.ts` | Upcoming earnings + catalysts |
| `map.ts` | Row → `DiscoverEvent` |
| `macro.ts` | Macro calendar week |
| `moves.ts` | Event-day move % + bar series for charts |
| `mentions.ts` | Upstream/downstream chains |
| `peers.ts` | Curated supply-chain hints |
| `types.ts` | Shared DTOs |

Shared catalog: `shared/source-keys.ts` (same ids as frontend `researchPaperSources.js`).

## Event copy (`title` + `summary`)

| Field | Source | UX |
|-------|--------|-----|
| `title` | `documents.title` (LLM headline), else `feed_label`, else `source_key` | Market Moves card headline; Watchlist catalyst label |
| `summary` | `documents.analysis` (truncated ~200 chars) | Market Moves body copy |

**Research ingest** (`documents/extract.ts`, `research_doc_v2`): LLM returns a 4–12 word `title` and 1–2 sentence `analysis`.

**Pharma ingest** (`research/clinical/pipeline.ts`, `pharma_sec_v3`): LLM `feed_label` → `documents.title`; phase label → `feed_label`; compact `analysis`.

Re-parse or backfill existing rows to refresh headlines on live cards.
