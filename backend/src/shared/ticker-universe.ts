import { db } from "../core/db.js";

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Tickers with parsed content, companies/issuers rows, or feed index entries. */
export async function loadTickerUniverse(max = 500): Promise<string[]> {
  const cap = clampInt(max, 1, 5000);
  const rows = await db.query<{ t: string }>(
    `
    SELECT DISTINCT ticker_norm AS t
    FROM (
      SELECT upper(trim(ticker)) AS ticker_norm FROM companies WHERE ticker IS NOT NULL
      UNION ALL
      SELECT upper(trim(ticker)) AS ticker_norm FROM issuers WHERE ticker IS NOT NULL
      UNION ALL
      SELECT ticker_norm FROM documents WHERE ticker_norm IS NOT NULL
      UNION ALL
      SELECT upper(trim(i.ticker)) AS ticker_norm
      FROM feed_entries e
      JOIN issuers i ON i.id = e.issuer_id
      WHERE i.ticker IS NOT NULL
    ) x
    WHERE length(ticker_norm) BETWEEN 1 AND 6
      AND ticker_norm ~ '^[A-Z]{1,6}$'
    ORDER BY t
    LIMIT $1
    `,
    [cap],
  );
  return rows.map((r) => r.t).filter(Boolean);
}

export type CompanyRow = {
  ticker: string;
  name: string;
  industry: string | null;
  earnings_date: string | null;
};

export async function loadCompanyByTicker(ticker: string): Promise<CompanyRow | null> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;
  const row = await db.one<{
    ticker: string;
    name: string | null;
    industry: string | null;
    earnings_date: string | null;
  }>(
    `
    SELECT upper(trim(ticker)) AS ticker, name, industry, earnings_date::text
    FROM companies
    WHERE upper(trim(ticker)) = $1
    LIMIT 1
    `,
    [t],
  );
  if (!row?.ticker) return null;
  return {
    ticker: row.ticker,
    name: String(row.name ?? row.ticker).trim() || row.ticker,
    industry: row.industry,
    earnings_date: row.earnings_date,
  };
}
