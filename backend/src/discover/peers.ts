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
  ATYR: { downstream: ["REGN", "VRTX", "BIIB", "MRNA", "SRPT"] },
  MRNA: { downstream: ["REGN", "PFE", "BIIB"] },
  SRPT: { downstream: ["BIIB", "VRTX", "MRNA"] },
  BIIB: { downstream: ["LLY", "REGN"] },
  REGN: { downstream: ["LLY", "VRTX"] },
  VRTX: { downstream: ["REGN", "BIIB"] },
};

export function peersForTicker(ticker: string): TickerPeers | null {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;
  return TICKER_PEER_HINTS[t] ?? null;
}
