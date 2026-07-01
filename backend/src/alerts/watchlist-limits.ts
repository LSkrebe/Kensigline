import { listUserActorWatchlist } from "./actor-watchlist.js";
import { listUserWatchlist, watchlistMaxTickers, WatchlistLimitError } from "./watchlist.js";

export { watchlistMaxTickers as alertWatchlistMax, WatchlistLimitError };

export async function combinedWatchlistCounts(userId: string): Promise<{
  tickerCount: number;
  actorCount: number;
  totalCount: number;
  max: number;
}> {
  const [tickers, actors] = await Promise.all([listUserWatchlist(userId), listUserActorWatchlist(userId)]);
  const max = watchlistMaxTickers();
  return {
    tickerCount: tickers.length,
    actorCount: actors.length,
    totalCount: tickers.length + actors.length,
    max,
  };
}

export async function assertCombinedWatchlistHasRoom(userId: string, addingNew: boolean): Promise<void> {
  if (!addingNew) return;
  const { totalCount, max } = await combinedWatchlistCounts(userId);
  if (totalCount >= max) throw new WatchlistLimitError(max);
}
