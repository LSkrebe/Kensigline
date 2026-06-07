import { db } from "../core/db.js";

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Tickers with parsed documents or a companies row. */
export async function loadTickerUniverse(max = 500): Promise<string[]> {
  const cap = clampInt(max, 1, 5000);
  const rows = await db.query<{ t: string }>(
    `
    SELECT DISTINCT upper(trim(x.ticker)) AS t
    FROM (
      SELECT ticker FROM companies WHERE ticker IS NOT NULL
      UNION ALL
      SELECT ticker FROM documents WHERE ticker IS NOT NULL
    ) x
    WHERE length(trim(x.ticker)) BETWEEN 1 AND 6
      AND trim(x.ticker) ~ '^[A-Za-z]{1,6}$'
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
