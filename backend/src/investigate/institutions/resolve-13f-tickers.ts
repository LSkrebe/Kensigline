import { db } from "../../core/db.js";
import { getSecTickerTitleMap } from "../../core/sec.js";
import type { Parsed13fHolding } from "./parse-13f.js";

export type InstitutionActivity = "Increased stake" | "New position" | "Reduced stake";

export type Mapped13fHolding = Parsed13fHolding & {
  ticker: string;
  resolve_source: "cusip" | "name" | "llm";
};

export type Resolve13fStats = {
  holdings_parsed: number;
  mapped: number;
  unmapped: number;
  cusip_hits: number;
  name_hits: number;
  unmapped_sample: Array<{ issuer_name: string; cusip: string | null }>;
};

let cusipTableReady: Promise<void> | null = null;
let nameIndexCache: { at: number; byName: Map<string, string> } | null = null;
const NAME_INDEX_TTL_MS = 30 * 60_000;

/** Normalize issuer / SEC title for fuzzy ticker matching. */
export function normalizeIssuerKey(name: string): string {
  return String(name ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(
      /\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|LLC|LLP|PLC|LP|THE|HOLDINGS|HOLDING|GROUP|AG|SA|NV|SE)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCusip(cusip: string | null | undefined): string | null {
  const c = String(cusip ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (c.length < 6 || c.length > 9) return null;
  return c;
}

export async function ensureCusipTickerMapTable(): Promise<void> {
  if (!cusipTableReady) {
    cusipTableReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS cusip_ticker_map (
          cusip text PRIMARY KEY,
          ticker text NOT NULL,
          source text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        `,
      )
      .then(() => undefined)
      .catch((e) => {
        cusipTableReady = null;
        throw e;
      });
  }
  await cusipTableReady;
}

async function loadNameIndex(): Promise<Map<string, string>> {
  const now = Date.now();
  if (nameIndexCache && now - nameIndexCache.at < NAME_INDEX_TTL_MS) return nameIndexCache.byName;

  const byName = new Map<string, string>();
  const setIfAbsent = (key: string, ticker: string) => {
    if (!key || key.length < 3) return;
    const t = ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!t || t.length > 8) return;
    if (!byName.has(key)) byName.set(key, t);
  };

  try {
    const sec = await getSecTickerTitleMap();
    for (const [ticker, title] of sec.entries()) {
      setIfAbsent(normalizeIssuerKey(title), ticker);
    }
  } catch {
    /* keep going with companies */
  }

  const companies = await db.query<{ ticker: string | null; name: string | null }>(
    `SELECT ticker, name FROM companies WHERE ticker IS NOT NULL AND length(trim(ticker)) BETWEEN 1 AND 8`,
  );
  for (const row of companies) {
    if (row.ticker && row.name) setIfAbsent(normalizeIssuerKey(row.name), row.ticker);
  }

  nameIndexCache = { at: now, byName };
  return byName;
}

async function lookupCusipTickersBatch(cusips: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(cusips.filter(Boolean))];
  const result = new Map<string, string>();
  if (!uniq.length) return result;

  await ensureCusipTickerMapTable();
  const exactRows = await db.query<{ cusip: string; ticker: string }>(
    `SELECT cusip, ticker FROM cusip_ticker_map WHERE cusip = ANY($1::text[])`,
    [uniq],
  );
  for (const row of exactRows) {
    result.set(row.cusip, String(row.ticker).toUpperCase());
  }

  const missing = uniq.filter((c) => !result.has(c));
  const prefixes = [...new Set(missing.filter((c) => c.length >= 6).map((c) => c.slice(0, 6)))];
  if (prefixes.length) {
    const prefixRows = await db.query<{ prefix: string; ticker: string }>(
      `
      SELECT DISTINCT ON (left(cusip, 6))
        left(cusip, 6) AS prefix,
        ticker
      FROM cusip_ticker_map
      WHERE left(cusip, 6) = ANY($1::text[])
      ORDER BY left(cusip, 6), updated_at DESC
      `,
      [prefixes],
    );
    const byPrefix = new Map(prefixRows.map((r) => [r.prefix, String(r.ticker).toUpperCase()]));
    for (const c of missing) {
      if (c.length >= 6) {
        const t = byPrefix.get(c.slice(0, 6));
        if (t) result.set(c, t);
      }
    }
  }
  return result;
}

export async function learnCusipTickersBatch(
  entries: Array<{ cusip: string | null | undefined; ticker: string; source: string }>,
): Promise<void> {
  const uniq = new Map<string, { cusip: string; ticker: string; source: string }>();
  for (const e of entries) {
    const cusip = normalizeCusip(e.cusip);
    const ticker = String(e.ticker ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.-]/g, "");
    if (!cusip || !ticker || ticker.length > 8) continue;
    uniq.set(cusip, { cusip, ticker, source: e.source });
  }
  if (!uniq.size) return;

  await ensureCusipTickerMapTable();
  const rows = [...uniq.values()];
  await db.query(
    `
    INSERT INTO cusip_ticker_map (cusip, ticker, source, updated_at)
    SELECT c, t, s, now()
    FROM UNNEST($1::text[], $2::text[], $3::text[]) AS u(c, t, s)
    ON CONFLICT (cusip) DO UPDATE
      SET ticker = EXCLUDED.ticker, source = EXCLUDED.source, updated_at = now()
    `,
    [rows.map((r) => r.cusip), rows.map((r) => r.ticker), rows.map((r) => r.source)],
  );
}

export async function learnCusipTicker(cusip: string | null | undefined, ticker: string, source: string): Promise<void> {
  await learnCusipTickersBatch([{ cusip, ticker, source }]);
}

/** Sum share/value lines that resolved to the same ticker (multiple CUSIP rows). */
export function consolidateMappedHoldingsByTicker(holdings: Mapped13fHolding[]): Mapped13fHolding[] {
  const byTicker = new Map<string, Mapped13fHolding>();
  for (const h of holdings) {
    const tick = String(h.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!tick) continue;
    const prev = byTicker.get(tick);
    if (!prev) {
      byTicker.set(tick, { ...h, ticker: tick });
      continue;
    }
    const shares = (Number(prev.shares) || 0) + (Number(h.shares) || 0);
    const value_usd = (Number(prev.value_usd) || 0) + (Number(h.value_usd) || 0);
    const pickName =
      h.resolve_source === "name" && prev.resolve_source !== "name"
        ? h.issuer_name
        : (prev.issuer_name?.length ?? 0) >= (h.issuer_name?.length ?? 0)
          ? prev.issuer_name
          : h.issuer_name;
    byTicker.set(tick, {
      ...prev,
      ticker: tick,
      shares: shares > 0 ? shares : null,
      value_usd: value_usd > 0 ? value_usd : null,
      issuer_name: pickName,
      resolve_source: h.resolve_source === "name" ? "name" : prev.resolve_source,
      cusip: prev.cusip ?? h.cusip,
    });
  }
  return [...byTicker.values()];
}

export async function resolveHoldingsToTickers(
  holdings: Parsed13fHolding[],
): Promise<{ mapped: Mapped13fHolding[]; unmapped: Parsed13fHolding[]; stats: Resolve13fStats }> {
  const byName = await loadNameIndex();
  const normalized = holdings.map((h) => ({ h, cusip: normalizeCusip(h.cusip) }));
  const cusipLookup = await lookupCusipTickersBatch(
    normalized.map((n) => n.cusip).filter((c): c is string => c != null),
  );

  const mapped: Mapped13fHolding[] = [];
  const unmapped: Parsed13fHolding[] = [];
  const learns: Array<{ cusip: string; ticker: string; source: string }> = [];
  let cusip_hits = 0;
  let name_hits = 0;

  for (const { h, cusip } of normalized) {
    let ticker: string | null = null;
    let resolve_source: Mapped13fHolding["resolve_source"] | null = null;
    const nameKey = normalizeIssuerKey(h.issuer_name);
    const fromName = byName.get(nameKey) ?? null;

    if (cusip) {
      const fromCusip = cusipLookup.get(cusip) ?? null;
      if (fromCusip && fromName && fromName !== fromCusip) {
        // Learned CUSIP map disagrees with issuer title — trust the name index.
        ticker = fromName;
        resolve_source = "name";
        name_hits += 1;
      } else if (fromCusip) {
        ticker = fromCusip;
        resolve_source = "cusip";
        cusip_hits += 1;
      }
    }

    if (!ticker && fromName) {
      ticker = fromName;
      resolve_source = "name";
      name_hits += 1;
    }

    if (ticker && resolve_source) {
      mapped.push({ ...h, cusip, ticker, resolve_source });
      if (cusip && fromName && fromName === ticker) {
        learns.push({ cusip, ticker, source: "name_resolve" });
      }
    } else {
      unmapped.push(h);
    }
  }

  await learnCusipTickersBatch(learns);
  const consolidated = consolidateMappedHoldingsByTicker(mapped);

  return {
    mapped: consolidated,
    unmapped,
    stats: {
      holdings_parsed: holdings.length,
      mapped: consolidated.length,
      unmapped: unmapped.length,
      cusip_hits,
      name_hits,
      unmapped_sample: unmapped.slice(0, 12).map((h) => ({
        issuer_name: h.issuer_name,
        cusip: normalizeCusip(h.cusip),
      })),
    },
  };
}

/** Prior share counts for filer+ticker (most recent institution tx before optional cutoff). */
export async function loadPriorFilerHoldingsBatch(
  filerId: string,
  tickers: string[],
  beforeAt?: string | null,
): Promise<Map<string, { shares: number | null; activity: string | null }>> {
  const id = String(filerId ?? "").trim();
  const uniq = [...new Set(tickers.map((t) => String(t ?? "").trim().toUpperCase()).filter(Boolean))];
  const out = new Map<string, { shares: number | null; activity: string | null }>();
  if (!id || !uniq.length) return out;

  const rows = await db.query<{ ticker: string; shares: string | null; activity: string | null }>(
    `
    SELECT DISTINCT ON (UPPER(i.ticker))
      UPPER(i.ticker) AS ticker,
      t.shares::text AS shares,
      t.activity
    FROM institution_transactions t
    JOIN issuers i ON i.id = t.issuer_id
    WHERE t.filer_id = $1::uuid
      AND UPPER(i.ticker) = ANY($2::text[])
      AND ($3::timestamptz IS NULL OR t.transaction_at < $3::timestamptz)
    ORDER BY UPPER(i.ticker), t.transaction_at DESC NULLS LAST
    `,
    [id, uniq, beforeAt ?? null],
  );
  for (const row of rows) {
    out.set(row.ticker, {
      shares: row.shares != null && Number.isFinite(Number(row.shares)) ? Number(row.shares) : null,
      activity: row.activity ? String(row.activity) : null,
    });
  }
  return out;
}

/** Prior share count + activity for filer+ticker (most recent institution tx). */
export async function loadPriorFilerHolding(args: {
  filerId?: string;
  filerName?: string;
  ticker: string;
  beforeAt?: string | null;
}): Promise<{ shares: number | null; activity: string | null } | null> {
  let filerId = String(args.filerId ?? "").trim();
  if (!filerId && args.filerName) {
    const row = await db.one<{ id: string }>(
      `SELECT id FROM filers WHERE lower(trim(display_name)) = lower(trim($1)) LIMIT 1`,
      [String(args.filerName).trim()],
    );
    filerId = row?.id ?? "";
  }
  if (!filerId) return null;
  const batch = await loadPriorFilerHoldingsBatch(filerId, [args.ticker], args.beforeAt ?? null);
  return batch.get(String(args.ticker ?? "").trim().toUpperCase()) ?? null;
}

export function activityFromShareDelta(args: {
  shares: number | null;
  priorShares: number | null;
  priorActivity: string | null;
}): { activity: InstitutionActivity; unchanged: boolean } {
  const shares = args.shares;
  const prior = args.priorShares;

  if (prior == null || !Number.isFinite(prior)) {
    return { activity: "New position", unchanged: false };
  }
  if (shares == null || !Number.isFinite(shares)) {
    return { activity: "New position", unchanged: false };
  }
  if (shares > prior) return { activity: "Increased stake", unchanged: false };
  if (shares < prior) return { activity: "Reduced stake", unchanged: false };

  const prev = String(args.priorActivity ?? "").trim();
  if (prev === "Increased stake" || prev === "New position" || prev === "Reduced stake") {
    return { activity: prev, unchanged: true };
  }
  return { activity: "New position", unchanged: true };
}

export function institutionsLlmFallbackEnabled(): boolean {
  // Default off — CUSIP/name only. Set INSTITUTIONS_LLM_FALLBACK=1 for zero-map residual.
  return String(process.env.INSTITUTIONS_LLM_FALLBACK ?? "0").trim() === "1";
}
