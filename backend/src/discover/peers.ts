/** Curated supply-chain / peer hints for Discover mentioned-ticker chains. */

export type TickerPeers = {
  upstream?: string[];
  downstream?: string[];
};

/** @type {Record<string, TickerPeers>} */
export const TICKER_PEER_HINTS: Record<string, TickerPeers> = {
  ASML: { upstream: ["AMAT", "LRCX", "KLAC"], downstream: ["TSM", "NVDA"] },
  LRCX: { upstream: ["ASML"], downstream: ["MU", "NVDA"] },
  TSM: { upstream: ["ASML", "AMAT"], downstream: ["NVDA", "AMD"] },
  NVDA: { upstream: ["TSM", "MU"], downstream: ["MSFT", "GOOG", "AMZN"] },
  AMD: { upstream: ["TSM"], downstream: ["MSFT", "GOOG", "META"] },
  AMAT: { upstream: ["ASML"], downstream: ["TSM", "LRCX"] },
};

export function peersForTicker(ticker: string): TickerPeers | null {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;
  return TICKER_PEER_HINTS[t] ?? null;
}
