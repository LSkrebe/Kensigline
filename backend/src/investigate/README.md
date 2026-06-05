# Investigate tab

Frontend: **INVESTIGATE** side tab (`activeTab=investigate`).

## Modes

| Mode | Folder | API |
|------|--------|-----|
| `insider` | `insider/` | `GET /api/insider/feed`, `GET /api/insider/cluster/:id`, … |
| `politicians` | `politicians/` | `GET /api/politicians/feed`, `GET /api/politicians/cluster/:id`, … |
| `institutions` | `institutions/` | `GET /api/institutions/feed`, `GET /api/institutions/cluster/:id` |

Each mode has `worker.ts` (enqueue + parse loop) and `pipeline.ts`. HTTP routes live in `api.ts` at this folder root.
