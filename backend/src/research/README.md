# Research tab

Frontend: **RESEARCH** side tab (`activeTab=main`).

## Modes

| Intel mode | Folder | Worker | What it does |
|------------|--------|--------|--------------|
| `market` | `market/` | `worker.ts` (root) | SEC filings, press/transcript RSS, scoring, catalyst papers |
| `clinical` | `clinical/` | `clinical/worker.ts` | Pharma SEC filings → clinical programs/milestones; `context.ts` + `runway.ts` power the clinical context panel |

## HTTP + shared code

| Path | Role |
|------|------|
| `api.ts` | `/api/research/*` handlers |
| `../documents/store.ts` | `documents` table + flow sync (insiders, politicians, 13F) |
| `../documents/extract.ts` | LLM document extraction |
| `../documents/presentation.ts` | Explore/paper presentation payload |
| `market/fundamentals.ts` | CONTEXT fundamentals — SEC Company Facts + document guidance |
| `market/ownership.ts` | CONTEXT ownership — 13F institutions + Form 3/5 insiders |
| `market/tracked-investors.ts` | CONTEXT tracked investors — net signed USD by insider / politician / 13F filer |
| `market/guidance-parse.ts` | Forward revenue growth regex (pure, testable) |
| `market/guidance.ts` | Forward revenue growth from stored research documents |
| `../core/fundamentals.ts` | SEC XBRL historical revenue / margin / cash series |
| `../core/form-ownership.ts` | Form 3/4/5 ownership XML parsing |
| `../core/runway.ts` | SEC XBRL cash / burn / runway math |
| `clinical/runway.ts` | Clinical CONTEXT runway fetch orchestrator |

Fundamentals for the Research CONTEXT panel ship on `GET /api/company?ticker=` as `fundamentals` (4-period SEC XBRL series; forward revenue growth from recent research documents).

Ownership (institutional + insider % of float, trailing 4 quarters) ships on the same endpoint as `ownership`. Politicians are not available from filings and return null until a defensible source exists.

Tracked investors (net signed USD exposure per entity, sorted by latest activity) ship on `GET /api/research/explore?ticker=` as `tracked_investors`.

Clinical runway (cash, quarterly burn, runway quarters) ships on `GET /api/pharma/clinical-context?ticker=` as `runway`.

Pharma trial historical outcomes (`GET /api/outcomes?mode=pharma`) include `buckets` with 21d / 63d / 252d forward-return series for Phase 3, Phase 2, and all events — consumed by the clinical CONTEXT panel chart after `POST /api/outcomes/recompute`.
