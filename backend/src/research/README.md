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
| `../documents/spec.ts` | Env + HTTP allowlist |
