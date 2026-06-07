import { peersForTicker } from "./peers.js";
import type { DiscoverMentioned } from "./types.js";

const TICKER_RE = /\$?([A-Z]{1,5})\b/g;

function normTicker(t: unknown): string {
  return String(t ?? "").trim().toUpperCase();
}

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const t = normTicker(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function fromDocumentData(data: unknown): DiscoverMentioned | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const rel = d.related_tickers ?? d.mentioned;
  if (!rel || typeof rel !== "object") return null;
  const r = rel as Record<string, unknown>;
  const upstream = uniq(Array.isArray(r.upstream) ? r.upstream.map(String) : []);
  const downstream = uniq(
    Array.isArray(r.downstream)
      ? r.downstream.map(String)
      : Array.isArray(r.adjacent)
        ? r.adjacent.map(String)
        : [],
  );
  if (!upstream.length && !downstream.length) return null;
  return { upstream, downstream };
}

function tickersFromAnalysis(analysis: string, focal: string, universe: Set<string>): string[] {
  const found: string[] = [];
  const text = String(analysis ?? "");
  let m: RegExpExecArray | null;
  TICKER_RE.lastIndex = 0;
  while ((m = TICKER_RE.exec(text))) {
    const t = normTicker(m[1]);
    if (!t || t === focal) continue;
    if (universe.size && !universe.has(t)) continue;
    found.push(t);
  }
  return uniq(found);
}

/** Resolve upstream/downstream chain for a past Discover card. */
export function resolveDiscoverMentioned(args: {
  ticker: string;
  analysis?: string | null;
  data?: unknown;
  universe?: Set<string>;
}): DiscoverMentioned | null {
  const focal = normTicker(args.ticker);
  if (!focal) return null;

  const fromDoc = fromDocumentData(args.data);
  const peers = peersForTicker(focal);
  const parsed = tickersFromAnalysis(args.analysis ?? "", focal, args.universe ?? new Set());

  let upstream = uniq([...(fromDoc?.upstream ?? []), ...(peers?.upstream ?? [])]);
  let downstream = uniq([
    ...(fromDoc?.downstream ?? []),
    ...(peers?.downstream ?? []),
    ...parsed,
  ]);

  upstream = upstream.filter((t) => t !== focal);
  downstream = downstream.filter((t) => t !== focal && !upstream.includes(t));

  if (!upstream.length && !downstream.length) return null;
  return { upstream, downstream };
}

export function mentionedSearchText(ticker: string, mentioned: DiscoverMentioned | null | undefined): string {
  if (!mentioned) return "";
  const chain = [
    ...(mentioned.upstream ?? []),
    normTicker(ticker),
    ...(mentioned.downstream ?? []),
  ].filter(Boolean);
  return chain.join(" ").toLowerCase();
}
