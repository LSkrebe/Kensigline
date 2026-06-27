import { isStrictlyUpcomingDay } from "./map.js";
import type { DiscoverEvent, DiscoverNextUpcoming } from "./types.js";

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

function truncateLabel(text: string, max = 48) {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Short left-column label for the next upcoming catalyst strip. */
export function discoverNextUpcomingLabel(event: DiscoverEvent): string {
  const title = String(event.title ?? "").trim();
  if (event.kind === "earnings") {
    if (!title || /^earnings\b/i.test(title)) return "Earnings";
    return truncateLabel(title);
  }
  if (title) return truncateLabel(title);
  const program = String(event.programKey ?? "").trim();
  if (program) return truncateLabel(program);
  return "Upcoming";
}

export function discoverNextUpcomingSoon(at: string): boolean {
  const ms = dayStartMs(at);
  if (!Number.isFinite(ms)) return false;
  const daysUntil = Math.round((ms - todayStartMs()) / 86_400_000);
  return daysUntil >= 0 && daysUntil <= 21;
}

export function mapDiscoverNextUpcoming(event: DiscoverEvent): DiscoverNextUpcoming {
  return {
    label: discoverNextUpcomingLabel(event),
    at: event.at,
    soon: discoverNextUpcomingSoon(event.at),
  };
}

function upcomingForTicker(ticker: string, pool: DiscoverEvent[]): DiscoverEvent[] {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return [];
  return pool
    .filter((e) => String(e.ticker ?? "").trim().toUpperCase() === t && isStrictlyUpcomingDay(e.at))
    .sort((a, b) => dayStartMs(a.at) - dayStartMs(b.at));
}

export function resolveNextUpcomingForTicker(
  ticker: string,
  pool: DiscoverEvent[],
): DiscoverNextUpcoming | null {
  const next = upcomingForTicker(ticker, pool)[0];
  return next ? mapDiscoverNextUpcoming(next) : null;
}

export function attachNextUpcomingToMarketMoves(
  marketMoves: DiscoverEvent[],
  upcomingPool: DiscoverEvent[],
): DiscoverEvent[] {
  return marketMoves.map((move) => {
    const next = resolveNextUpcomingForTicker(move.ticker, upcomingPool);
    if (!next) return move;
    return { ...move, next_upcoming: next };
  });
}
