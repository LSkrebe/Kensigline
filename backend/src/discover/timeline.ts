import { loadHighlightedMarketMoves } from "./highlighted-moves.js";
import { loadTickerUniverse } from "../shared/ticker-universe.js";
import { loadUpcomingDiscoverEvents } from "./ahead.js";
import { loadUpcomingMacroDays } from "./macro.js";
import { mentionedSearchText } from "./mentions.js";
import { buildMoveReactionsForEvents } from "./moves.js";
import { eventMatchesQuery, eventPassesSourceFilter } from "./map.js";
import { loadPastDiscoverEvents } from "./past.js";
import type { DiscoverEvent, DiscoverTimelineResult } from "./types.js";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function dayStartMs(at: string) {
  const raw = String(at ?? "").trim();
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return NaN;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function todayStartMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type DiscoverTimelineOpts = {
  query?: string;
  sourceKeys?: Set<string> | null;
  pastDays?: number;
  aheadDays?: number;
  limit?: number;
  macroDays?: number;
};

export async function buildDiscoverTimeline(opts: DiscoverTimelineOpts = {}): Promise<DiscoverTimelineResult> {
  const pastDays = clampInt(opts.pastDays, 7, 365, 90);
  const aheadDays = clampInt(opts.aheadDays, 7, 365, 180);
  const limit = clampInt(opts.limit, 10, 500, 120);
  const macroDayLimit = clampInt(opts.macroDays, 1, 14, 5);
  const q = String(opts.query ?? "").trim();
  const enabled = opts.sourceKeys ?? null;

  const [pastRaw, upcomingRaw, macro, universe, marketMovesRaw] = await Promise.all([
    loadPastDiscoverEvents({ pastDays, limit }),
    loadUpcomingDiscoverEvents({ aheadDays, limit }),
    loadUpcomingMacroDays(macroDayLimit),
    loadTickerUniverse(Number(process.env.DISCOVER_MAX_UNIVERSE ?? 500)),
    loadHighlightedMarketMoves({ pastDays, limit }),
  ]);

  const filterRow = (event: DiscoverEvent) => {
    if (!eventPassesSourceFilter(event, enabled)) return false;
    const mentionedHay = mentionedSearchText(event.ticker, event.mentioned ?? null);
    return eventMatchesQuery(event, q, mentionedHay);
  };

  const past = pastRaw.filter(filterRow).sort((a, b) => dayStartMs(b.at) - dayStartMs(a.at));
  const upcoming = upcomingRaw
    .filter(filterRow)
    .filter((e) => {
      const ms = dayStartMs(e.at);
      return Number.isFinite(ms) && ms >= todayStartMs();
    })
    .sort((a, b) => dayStartMs(a.at) - dayStartMs(b.at));

  const market_moves = marketMovesRaw.filter(filterRow).sort((a, b) => dayStartMs(b.at) - dayStartMs(a.at));
  const moves = await buildMoveReactionsForEvents(market_moves);

  return {
    ok: true,
    upcoming,
    past,
    market_moves,
    macro,
    moves,
    meta: {
      past_days: pastDays,
      ahead_days: aheadDays,
      universe: universe.length,
    },
  };
}
