/**
 * Precomputed investor dossier Stats / Holdings / Recent trades.
 * Same rules as the former frontend builder — Form 4 founders with $0 converts
 * still get a book via sharesAfter; sell-only windows still produce filings.
 */

export type DossierActivityHolding = {
  ticker: string;
  name: string;
  fullName: string;
  dollars: number;
  pct: number;
  daily?: { text: string; tone: "isUp" | "isDown" | "isFlat" } | null;
};

export type DossierActivityChange = {
  ticker: string;
  name: string;
  fullName: string;
  from: number;
  to: number;
  kind: "new" | "increased" | "decreased" | "closed" | "unchanged";
};

export type DossierActivityFiling = {
  key: string;
  filedMs: number;
  changes: DossierActivityChange[];
  unchanged: DossierActivityChange[];
};

export type DossierActivity = {
  since: string | null;
  aum: string;
  delay: string;
  positions: string;
  holdings: DossierActivityHolding[];
  filings: DossierActivityFiling[];
};

type ActivityRow = {
  type?: string;
  layout?: string;
  ticker?: string;
  companyName?: string;
  code?: string;
  codeTone?: string | null;
  acquiredDisposed?: string | null;
  amountUsd?: number | null;
  shares?: number | null;
  sharesAfter?: number | null;
  performanceMeta?: { price?: number | null; sharesAfter?: number | null } | null;
  price?: number | null;
  value?: string | null;
  tradeTs?: string | null;
  ts?: string | null;
  filedAt?: string | null;
};

function dayKey(ms: number): string | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatLongDate(ms: number): string | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function formatAum(n: number): string {
  if (!(n > 0)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function formatDelay(days: number | null): string {
  if (!(days != null && Number.isFinite(days))) return "—";
  const rounded = Math.max(0, Math.round(days));
  if (rounded >= 6) {
    const weeks = Math.max(1, Math.round(rounded / 7));
    if (Math.abs(rounded - weeks * 7) <= 2) return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return rounded === 1 ? "1 day" : `${rounded} days`;
}

function shortCompany(name: string, ticker: string): string {
  const cleaned = String(name || ticker || "")
    .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|N\.V\.|Ltd\.?|Limited|plc|S\.A\.)$/i, "")
    .replace(/,?\s+Holdings$/i, "")
    .replace(/\s*\/[a-z]{2,}\s*$/i, "")
    .replace(/\.com$/i, "")
    .replace(/[,\s.]+$/g, "")
    .trim();
  return cleaned || ticker || "—";
}

function integerWeights<T extends { dollars: number }>(rows: T[]): Array<T & { pct: number }> {
  const total = rows.reduce((sum, row) => sum + (Number(row.dollars) || 0), 0);
  if (!(total > 0)) return rows.map((row) => ({ ...row, pct: 0 }));
  const ranked = rows.map((row, index) => {
    const raw = ((Number(row.dollars) || 0) / total) * 100;
    return { row, index, pct: Math.round(raw), frac: raw - Math.floor(raw) };
  });
  let leftover = 100 - ranked.reduce((sum, item) => sum + item.pct, 0);
  ranked
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((item) => {
      if (leftover <= 0) return;
      item.pct += 1;
      leftover -= 1;
    });
  return ranked
    .sort((a, b) => a.index - b.index)
    .map((item) => ({ ...item.row, pct: item.pct }));
}

export function tradeDollars(row: ActivityRow): number {
  const n = Number(row?.amountUsd);
  if (Number.isFinite(n) && n > 1) return n;
  const raw = String(row?.value ?? "").trim();
  if (!raw || raw === "—") return 0;
  if (/sh\b/i.test(raw) && !/\$/.test(raw)) return 0;
  const text = raw.replace(/[$,]/g, "");
  const range = text.match(/([\d.]+)\s*-\s*([\d.]+)\s*([kmb])?/i);
  if (range) {
    const unit = String(range[3] || "").toLowerCase();
    const scale = unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
    return ((Number(range[1]) + Number(range[2])) / 2) * scale;
  }
  const single = text.match(/([\d.]+)\s*([kmb])?/i);
  if (!single) return 0;
  const unit = String(single[2] || "").toLowerCase();
  const scale = unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return Number(single[1]) * scale;
}

export function tradeShares(row: ActivityRow): number {
  const direct = Number(row?.shares);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const raw = String(row?.value ?? "").trim();
  const m = raw.match(/([\d.]+)\s*([kmb])?\s*sh\b/i);
  if (!m) return 0;
  const unit = String(m[2] || "").toLowerCase();
  const scale = unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return Number(m[1]) * scale;
}

function sharesAfterOf(row: ActivityRow): number | null {
  const raw = row?.sharesAfter ?? row?.performanceMeta?.sharesAfter;
  if (raw == null || raw === ("" as unknown)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function unitPriceHint(row: ActivityRow, dollars: number, shares: number): number | null {
  const metaPrice = Number(row?.performanceMeta?.price ?? row?.price);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;
  if (dollars > 1 && shares > 0) return dollars / shares;
  return null;
}

function codeTone(code: string, ad?: string | null): "sell" | "buy" | "neutral" {
  const c = String(code ?? "").toUpperCase();
  const side = String(ad ?? "").toUpperCase();
  if (c === "S" || c === "F" || (c === "D" && side === "D") || c === "E" || c === "K" || c === "U" || c === "Z")
    return "sell";
  if (c === "P" || c === "A" || c === "M" || c === "V" || (c === "I" && side === "A")) return "buy";
  if (/^(s|sale|sell)(\b|$)/i.test(c)) return "sell";
  if (/^(p|purchase|buy)(\b|$)/i.test(c)) return "buy";
  return "neutral";
}

function isSellTrade(tone: string | null | undefined, row: ActivityRow): boolean {
  if (tone === "sell") return true;
  if (tone === "buy") return false;
  const ad = String(row?.acquiredDisposed ?? "").toUpperCase();
  if (ad === "D") return true;
  if (ad === "A") return false;
  const code = String(row?.code ?? "").toUpperCase();
  return code === "S" || code === "F" || code === "E" || code === "K" || code === "U" || code === "Z";
}

/** Map API dossier transactions into activity input rows. */
export function activityRowsFromDossierTxns(transactions: any[]): ActivityRow[] {
  const out: ActivityRow[] = [];
  for (const txn of transactions ?? []) {
    const s = txn?.sheetRow ?? {};
    const ticker = String(txn?.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const code = String(s.transactionCode ?? s.transactionType ?? s.activity ?? "").trim().toUpperCase();
    const amountUsd =
      s.amountUsd != null
        ? Number(s.amountUsd)
        : s.amountUsdMid != null
          ? Number(s.amountUsdMid)
          : null;
    const sharesAfter =
      s.sharesAfter != null
        ? Number(s.sharesAfter)
        : s.performanceMeta?.sharesAfter != null
          ? Number(s.performanceMeta.sharesAfter)
          : null;
    out.push({
      type: "trade",
      layout: "txnCompany",
      ticker,
      companyName: String(txn?.company ?? s.company ?? ticker).trim(),
      code: code || "—",
      codeTone: codeTone(code, s.acquiredDisposed),
      acquiredDisposed: s.acquiredDisposed ?? null,
      amountUsd: Number.isFinite(amountUsd as number) && (amountUsd as number) > 1 ? amountUsd : null,
      shares: s.shares != null && Number(s.shares) > 0 ? Number(s.shares) : null,
      sharesAfter: Number.isFinite(sharesAfter as number) && (sharesAfter as number) >= 0 ? sharesAfter : null,
      performanceMeta: s.performanceMeta ?? null,
      tradeTs: txn?.ts ?? s.ts ?? null,
      ts: txn?.ts ?? s.ts ?? null,
      filedAt: s.filedAt ?? null,
    });
  }
  return out;
}

export function buildDossierActivity(rows: ActivityRow[]): DossierActivity | null {
  const trades = (rows ?? [])
    .map((row) => {
      const ticker = String(row?.ticker ?? "").trim().toUpperCase() || "—";
      const title = String(row?.companyName ?? row?.ticker ?? "Trade").trim();
      const code = String(row?.code ?? "").trim().toUpperCase() || "—";
      const tone = row?.codeTone ?? codeTone(code, row?.acquiredDisposed);
      const tradeMs = new Date(row?.tradeTs ?? row?.ts ?? 0).getTime();
      const filedMs = new Date(row?.filedAt ?? row?.tradeTs ?? row?.ts ?? 0).getTime();
      const dollars = tradeDollars(row);
      const shares = tradeShares(row);
      const sharesAfter = sharesAfterOf(row);
      const sell = isSellTrade(tone, row);
      const price = unitPriceHint(row, dollars, shares);
      return {
        ticker,
        name: shortCompany(title, ticker),
        fullName: title || ticker,
        dollars,
        shares,
        sharesAfter,
        price,
        sell,
        tradeMs: Number.isFinite(tradeMs) ? tradeMs : null,
        filedMs: Number.isFinite(filedMs) ? filedMs : null,
      };
    })
    .filter((trade) => trade.ticker && trade.ticker !== "—" && trade.tradeMs != null) as Array<{
    ticker: string;
    name: string;
    fullName: string;
    dollars: number;
    shares: number;
    sharesAfter: number | null;
    price: number | null;
    sell: boolean;
    tradeMs: number;
    filedMs: number | null;
  }>;

  trades.sort((a, b) => a.tradeMs - b.tradeMs || (a.filedMs ?? 0) - (b.filedMs ?? 0));
  if (!trades.length) return null;

  const lastPrice = new Map<string, number>();
  for (const trade of trades) {
    if (trade.price != null && trade.price > 0) lastPrice.set(trade.ticker, trade.price);
  }

  type BookItem = { dollars: number; shares: number | null; name: string; fullName: string };
  const book = new Map<string, BookItem>();
  const groups = new Map<string, { key: string; filedMs: number; trades: typeof trades }>();
  for (const trade of trades) {
    const key = dayKey(trade.filedMs ?? trade.tradeMs);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, filedMs: trade.filedMs ?? trade.tradeMs, trades: [] });
    groups.get(key)!.trades.push(trade);
  }
  const ordered = [...groups.values()].sort((a, b) => a.filedMs - b.filedMs);
  const filings: DossierActivityFiling[] = [];

  for (const group of ordered) {
    const before = new Map(book);
    for (const trade of group.trades) {
      const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0;
      const size =
        trade.dollars > 1 ? trade.dollars : trade.shares > 0 && px > 0 ? trade.shares * px : 0;
      if (!(size > 0) && !(trade.sharesAfter != null && trade.sharesAfter >= 0)) continue;
      const delta = trade.sell ? -size : size;
      let next = Math.max(0, (book.get(trade.ticker)?.dollars ?? 0) + delta);
      if (trade.sharesAfter != null && trade.sharesAfter >= 0 && px > 0) next = trade.sharesAfter * px;
      else if (trade.sharesAfter === 0) next = 0;
      if (next <= 1) book.delete(trade.ticker);
      else {
        book.set(trade.ticker, {
          dollars: next,
          shares:
            trade.sharesAfter != null && trade.sharesAfter >= 0
              ? trade.sharesAfter
              : book.get(trade.ticker)?.shares ?? null,
          name: trade.name,
          fullName: trade.fullName || book.get(trade.ticker)?.fullName || trade.name,
        });
      }
    }

    const totalBefore = [...before.values()].reduce((sum, item) => sum + item.dollars, 0);
    const totalAfter = [...book.values()].reduce((sum, item) => sum + item.dollars, 0);
    const weight = (map: Map<string, BookItem>, total: number, ticker: string) =>
      total > 0 ? ((map.get(ticker)?.dollars ?? 0) / total) * 100 : 0;
    const seen = new Set<string>();
    const changes: DossierActivityChange[] = [];

    const dayAbs = group.trades.reduce((sum, trade) => {
      const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0;
      const size =
        trade.dollars > 1 ? trade.dollars : trade.shares > 0 && px > 0 ? trade.shares * px : trade.shares;
      return sum + Math.abs(size || 0);
    }, 0);

    for (const trade of group.trades) {
      if (seen.has(trade.ticker)) continue;
      seen.add(trade.ticker);
      const from = weight(before, totalBefore, trade.ticker);
      const to = weight(book, totalAfter, trade.ticker);
      const net = group.trades
        .filter((item) => item.ticker === trade.ticker)
        .reduce((sum, item) => {
          const px = lastPrice.get(item.ticker) ?? item.price ?? 0;
          const size =
            item.dollars > 1 ? item.dollars : item.shares > 0 && px > 0 ? item.shares * px : 0;
          return sum + (item.sell ? -size : size);
        }, 0);
      const had = (before.get(trade.ticker)?.dollars ?? 0) > 1;
      const has = (book.get(trade.ticker)?.dollars ?? 0) > 1;
      let kind: DossierActivityChange["kind"] = !had && has
        ? "new"
        : had && !has
          ? "closed"
          : net > 0
            ? "increased"
            : net < 0
              ? "decreased"
              : "unchanged";

      if (kind === "unchanged" || (from < 0.05 && to < 0.05)) {
        const tickerTrades = group.trades.filter((item) => item.ticker === trade.ticker);
        const anySell = tickerTrades.some((item) => item.sell);
        const anyBuy = tickerTrades.some((item) => !item.sell);
        const sized = tickerTrades.some((item) => item.dollars > 1 || item.shares > 0);
        if (!sized) continue;
        if (anySell && !anyBuy) kind = had && !has ? "closed" : "decreased";
        else if (anyBuy && !anySell) kind = !had && has ? "new" : "increased";
        else if (net < 0) kind = "decreased";
        else if (net > 0) kind = "increased";
        else continue;
      }

      let fromPct = from;
      let toPct = to;
      if (fromPct < 0.05 && toPct < 0.05 && dayAbs > 0) {
        const tickerAbs = group.trades
          .filter((item) => item.ticker === trade.ticker)
          .reduce((sum, item) => {
            const px = lastPrice.get(item.ticker) ?? item.price ?? 0;
            const size =
              item.dollars > 1 ? item.dollars : item.shares > 0 && px > 0 ? item.shares * px : item.shares;
            return sum + Math.abs(size || 0);
          }, 0);
        const slice = (tickerAbs / dayAbs) * 100;
        if (kind === "decreased" || kind === "closed") {
          fromPct = slice;
          toPct = 0;
        } else {
          fromPct = 0;
          toPct = slice;
        }
      }

      const fullName =
        book.get(trade.ticker)?.fullName || before.get(trade.ticker)?.fullName || trade.fullName;
      changes.push({
        ticker: trade.ticker,
        name: book.get(trade.ticker)?.name || before.get(trade.ticker)?.name || trade.name,
        fullName,
        from: fromPct,
        to: toPct,
        kind,
      });
    }

    const unchanged: DossierActivityChange[] = [];
    for (const [ticker, item] of book) {
      if (seen.has(ticker)) continue;
      const to = weight(book, totalAfter, ticker);
      if (to < 0.05) continue;
      unchanged.push({
        ticker,
        name: item.name,
        fullName: item.fullName || item.name,
        from: weight(before, totalBefore, ticker),
        to,
        kind: "unchanged",
      });
    }
    unchanged.sort((a, b) => b.to - a.to);
    filings.push({ key: group.key, filedMs: group.filedMs, changes, unchanged });
  }

  const disclosed = new Map<string, BookItem | null>();
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]!;
    if (disclosed.has(trade.ticker)) continue;
    if (trade.sharesAfter == null || trade.sharesAfter < 0) continue;
    const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0;
    const dollars =
      trade.sharesAfter > 0 && px > 0 ? trade.sharesAfter * px : trade.sharesAfter > 0 ? trade.sharesAfter : 0;
    if (trade.sharesAfter <= 0) {
      disclosed.set(trade.ticker, null);
      continue;
    }
    disclosed.set(trade.ticker, {
      dollars: dollars > 1 ? dollars : Math.max(dollars, 1),
      shares: trade.sharesAfter,
      name: trade.name,
      fullName: trade.fullName,
    });
  }

  let holdingSource = book;
  if (book.size === 0 && [...disclosed.values()].some(Boolean)) {
    holdingSource = new Map([...disclosed.entries()].filter(([, v]) => v) as [string, BookItem][]);
  } else if (book.size > 0) {
    for (const [ticker, item] of disclosed) {
      if (!item || book.has(ticker)) continue;
      holdingSource.set(ticker, item);
    }
  }

  const holdings = integerWeights(
    [...holdingSource.entries()].map(([ticker, item]) => ({
      ticker,
      name: item.name,
      fullName: item.fullName || item.name,
      dollars: item.dollars,
    })),
  )
    .filter((row) => row.dollars > 1)
    .sort((a, b) => b.pct - a.pct || b.dollars - a.dollars);

  const delays = trades
    .filter((trade) => trade.filedMs != null && trade.tradeMs != null && trade.filedMs >= trade.tradeMs)
    .map((trade) => ((trade.filedMs as number) - trade.tradeMs) / 86400000);
  const aum = holdings.reduce((sum, row) => sum + row.dollars, 0);
  return {
    since: formatLongDate(trades[0]!.tradeMs),
    aum: formatAum(aum),
    delay: formatDelay(delays.length ? delays.reduce((sum, n) => sum + n, 0) / delays.length : null),
    positions: String(holdings.length),
    holdings,
    filings: filings.filter((filing) => filing.changes.length).reverse(),
  };
}

export function formatHoldingDailyReturn(
  closes: Array<number | null | undefined>,
): DossierActivityHolding["daily"] {
  const series = (closes ?? []).filter((value): value is number => Number.isFinite(value) && (value as number) > 0);
  if (series.length < 2) return null;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  if (!(prev > 0)) return null;
  const pct = ((last - prev) / prev) * 100;
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0.05) return { text: `+${abs}%`, tone: "isUp" };
  if (pct < -0.05) return { text: `−${abs}%`, tone: "isDown" };
  return { text: "0.0%", tone: "isFlat" };
}
