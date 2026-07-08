import { db } from "../core/db.js";
import { discoverEventIsMarketMove } from "./map.js";
import type { DiscoverEvent } from "./types.js";

export type DiscoverMoveReaction = {
  movePct: number;
  closes: number[];
};

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function eventDayUtc(at: string) {
  const raw = String(at ?? "").trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : raw.slice(0, 10);
}

async function loadBarsMap(ticker: string) {
  const rows = await db.query<{ day: string; close: number }>(
    `
    SELECT day::text AS day, close
    FROM bars
    WHERE ticker = $1
      AND day >= (CURRENT_DATE - INTERVAL '200 days')
    ORDER BY day ASC
    `,
    [ticker],
  );
  const days: string[] = [];
  const closes: number[] = [];
  for (const r of rows) {
    const d = String(r.day);
    const c = Number(r.close);
    if (!d || !Number.isFinite(c)) continue;
    days.push(d);
    closes.push(c);
  }
  return { days, closes };
}

function nextTradingIndex(days: string[], eventDay: string) {
  let lo = 0;
  let hi = days.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = days[mid]!;
    if (d >= eventDay) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

function reactionForEvent(
  bars: { days: string[]; closes: number[] },
  eventDay: string,
): DiscoverMoveReaction | null {
  const baseIdx = nextTradingIndex(bars.days, eventDay);
  if (baseIdx < 1) return null;
  const prev = bars.closes[baseIdx - 1]!;
  const cur = bars.closes[baseIdx]!;
  if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) return null;
  const movePct = Math.round(((cur / prev - 1) * 100) * 10) / 10;
  const start = Math.max(0, baseIdx - 8);
  const closes = bars.closes.slice(start, baseIdx + 1);
  if (closes.length < 2) return null;
  return { movePct, closes };
}

/** Session-style move + trailing closes for sparkline charts on Market Moves cards. */
export async function buildMoveReactionsForEvents(
  events: DiscoverEvent[],
): Promise<Record<string, DiscoverMoveReaction>> {
  const maxEvents = clampInt(process.env.DISCOVER_MOVE_MAX, 5, 80, 36);
  const eligible = events
    .filter((e) => discoverEventIsMarketMove(e))
    .slice(0, maxEvents);

  const byTicker = new Map<string, DiscoverEvent[]>();
  for (const e of eligible) {
    const t = String(e.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const list = byTicker.get(t) ?? [];
    list.push(e);
    byTicker.set(t, list);
  }

  const out: Record<string, DiscoverMoveReaction> = {};

  await Promise.all(
    [...byTicker.entries()].map(async ([ticker, evs]) => {
      try {
        const bars = await loadBarsMap(ticker);
        if (bars.days.length < 2) return;
        for (const e of evs) {
          const reaction = reactionForEvent(bars, eventDayUtc(e.at));
          if (reaction) out[e.id] = reaction;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`discover_move_reaction_skipped ${ticker}: ${msg}`);
      }
    }),
  );

  return out;
}
