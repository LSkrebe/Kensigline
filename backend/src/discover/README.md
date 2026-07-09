# Macro calendar

Upcoming macro economic releases for the terminal macro calendar page.

## API

| Route | Description |
|-------|-------------|
| `GET /api/macro/calendar` | Upcoming macro release week |

Query params:

| Param | Default | Description |
|-------|---------|-------------|
| `days` | 7 | Business days to include (1–14) |

Response:

| Field | Description |
|-------|-------------|
| `macro` | Array of `{ date, events[] }` — Yahoo Finance live when available, else business-day templates |

## Env

| Variable | Default | Role |
|----------|---------|------|
| `MACRO_CALENDAR_CACHE_MS` | 45000 | In-memory API response TTL |
| `MACRO_CALENDAR_YAHOO_CACHE_MS` | 3600000 | In-memory Yahoo macro response TTL |
| `MACRO_CALENDAR_MAX_EVENTS_PER_DAY` | 12 | Cap per business day (sorted by impact) |
| `MACRO_CALENDAR_YAHOO_MAX_PAGES` | 4 | Yahoo pagination cap (100 rows/page) |

## Module map

| File | Role |
|------|------|
| `api.ts` | HTTP routes |
| `macro-calendar-cache.ts` | Cached macro week loader |
| `macro.ts` | Macro calendar week (template fallback) |
| `macro-live.ts` | Yahoo economic calendar fetch + cache |
| `types.ts` | Shared DTOs |
