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

async function lookupCusipTicker(cusip: string): Promise<string | null> {
  await ensureCusipTickerMapTable();
  const exact = await db.one<{ ticker: string }>(`SELECT ticker FROM cusip_ticker_map WHERE cusip = $1 LIMIT 1`, [cusip]);
  if (exact?.ticker) return String(exact.ticker).toUpperCase();

  if (cusip.length >= 6) {
    const prefix = cusip.slice(0, 6);
    const row = await db.one<{ ticker: string }>(
      `SELECT ticker FROM cusip_ticker_map WHERE left(cusip, 6) = $1 ORDER BY updated_at DESC LIMIT 1`,
      [prefix],
    );
    if (row?.ticker) return String(row.ticker).toUpperCase();
  }
  return null;
}

export async function learnCusipTicker(cusip: string | null | undefined, ticker: string, source: string): Promise<void> {
  const c = normalizeCusip(cusip);
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
  if (!c || !t || t.length > 8) return;
  await ensureCusipTickerMapTable();
  await db.query(
    `
    INSERT INTO cusip_ticker_map (cusip, ticker, source, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (cusip) DO UPDATE
      SET ticker = EXCLUDED.ticker, source = EXCLUDED.source, updated_at = now()
    `,
    [c, t, source],
  );
}

export async function resolveHoldingsToTickers(
  holdings: Parsed13fHolding[],
): Promise<{ mapped: Mapped13fHolding[]; unmapped: Parsed13fHolding[]; stats: Resolve13fStats }> {
  const byName = await loadNameIndex();
  const mapped: Mapped13fHolding[] = [];
  const unmapped: Parsed13fHolding[] = [];
  let cusip_hits = 0;
  let name_hits = 0;

  for (const h of holdings) {
    const cusip = normalizeCusip(h.cusip);
    let ticker: string | null = null;
    let resolve_source: Mapped13fHolding["resolve_source"] | null = null;

    if (cusip) {
      ticker = await lookupCusipTicker(cusip);
      if (ticker) {
        resolve_source = "cusip";
        cusip_hits += 1;
      }
    }

    if (!ticker) {
      const key = normalizeIssuerKey(h.issuer_name);
      const fromName = byName.get(key) ?? null;
      if (fromName) {
        ticker = fromName;
        resolve_source = "name";
        name_hits += 1;
        if (cusip) void learnCusipTicker(cusip, fromName, "name_resolve");
      }
    }

    if (ticker && resolve_source) {
      mapped.push({ ...h, cusip, ticker, resolve_source });
    } else {
      unmapped.push(h);
    }
  }

  return {
    mapped,
    unmapped,
    stats: {
      holdings_parsed: holdings.length,
      mapped: mapped.length,
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

/** Prior share count + activity for filer+ticker (most recent institutions doc). */
export async function loadPriorFilerHolding(args: {
  filerName: string;
  ticker: string;
}): Promise<{ shares: number | null; activity: string | null } | null> {
  const filer = String(args.filerName ?? "").trim();
  const ticker = String(args.ticker ?? "").trim().toUpperCase();
  if (!filer || !ticker) return null;

  const row = await db.one<{ shares: string | null; activity: string | null }>(
    `
    SELECT r->>'shares' AS shares, r->>'activity' AS activity
    FROM documents d
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.data->'cluster'->'worksheet_rows', '[]'::jsonb)) r
    WHERE d.feed_kind = 'institutions'
      AND UPPER(COALESCE(d.ticker, '')) = $1
      AND LOWER(COALESCE(r->>'institution_name', r->>'key', '')) = LOWER($2)
    ORDER BY d.parsed_at DESC NULLS LAST
    LIMIT 1
    `,
    [ticker, filer],
  );
  if (!row) return null;
  const shares = row.shares != null && Number.isFinite(Number(row.shares)) ? Number(row.shares) : null;
  return { shares, activity: row.activity ? String(row.activity) : null };
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
