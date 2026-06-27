import { isIdeaGreenHighlight } from "../core/idea-score.js";
import { loadHighlightedMarketMoves } from "./highlighted-moves.js";
import { loadTickerUniverse } from "../shared/ticker-universe.js";
import { loadUpcomingCatalystPool } from "./ahead.js";
import { loadUpcomingMacroDays } from "./macro.js";
import { mentionedSearchText } from "./mentions.js";
import { buildMoveReactionsForEvents } from "./moves.js";
import { eventMatchesQuery, eventPassesSourceFilter, isStrictlyUpcomingDay } from "./map.js";
import { attachNextUpcomingToMarketMoves } from "./next-upcoming.js";
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

  const [pastRaw, macro, universe, marketMovesRaw] = await Promise.all([
    loadPastDiscoverEvents({ pastDays, limit }),
    loadUpcomingMacroDays(macroDayLimit),
    loadTickerUniverse(Number(process.env.DISCOVER_MAX_UNIVERSE ?? 500)),
    loadHighlightedMarketMoves({ pastDays, limit }),
  ]);

  const moveTickers = [
    ...new Set(
      marketMovesRaw.map((m) => String(m.ticker ?? "").trim().toUpperCase()).filter(Boolean),
    ),
  ];
  const upcomingPoolRaw = await loadUpcomingCatalystPool({
    aheadDays,
    limit: Math.max(limit, 200),
    tickers: moveTickers.length ? moveTickers : null,
  });

  const filterRow = (event: DiscoverEvent) => {
    if (!eventPassesSourceFilter(event, enabled)) return false;
    const mentionedHay = mentionedSearchText(event.ticker, event.mentioned ?? null);
    return eventMatchesQuery(event, q, mentionedHay);
  };

  const past = pastRaw.filter(filterRow).sort((a, b) => dayStartMs(b.at) - dayStartMs(a.at));
  const upcoming = upcomingPoolRaw
    .filter((e) => isStrictlyUpcomingDay(e.at) && isIdeaGreenHighlight(e))
    .filter(filterRow)
    .sort((a, b) => dayStartMs(a.at) - dayStartMs(b.at));

  const market_moves_filtered = marketMovesRaw.filter(filterRow).sort((a, b) => dayStartMs(b.at) - dayStartMs(a.at));
  const market_moves = attachNextUpcomingToMarketMoves(market_moves_filtered, upcomingPoolRaw);
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
