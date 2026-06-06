# Research tab

Frontend: **RESEARCH** side tab (`activeTab=main`).

## Modes

| Intel mode | Folder | Worker | What it does |
|------------|--------|--------|--------------|
| `market` | `market/` | `worker.ts` (root) | SEC filings, press/transcript RSS, scoring, catalyst papers |
| `clinical` | `clinical/` | `clinical/worker.ts` | Pharma SEC filings → clinical programs/milestones; `context.ts` powers the clinical context panel |

## HTTP + shared code

| Path | Role |
|------|------|
| `api.ts` | `/api/research/*` handlers |
| `../documents/store.ts` | `documents` table + flow sync (insiders, politicians, 13F) |
| `../documents/extract.ts` | LLM document extraction |
| `../documents/presentation.ts` | Explore/paper presentation payload |
| `market/fundamentals.ts` | CONTEXT fundamentals — SEC Company Facts + document guidance |
| `market/guidance-parse.ts` | Forward revenue growth regex (pure, testable) |
| `market/guidance.ts` | Forward revenue growth from stored research documents |
| `../core/fundamentals.ts` | SEC XBRL historical revenue / margin math |

Fundamentals for the Research CONTEXT panel ship on `GET /api/company?ticker=` as `fundamentals` (historical from SEC Company Facts; forward revenue growth from recent research documents).
