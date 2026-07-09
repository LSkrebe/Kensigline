import { db } from "../../core/db.js";
import { formatUsdCompact } from "../../shared/money.js";
import {
  insiderTxnSign,
  institutionActivitySign,
  politicianTxnSign,
} from "./tracked-investors-sign.js";

export type TrackedInvestorType = "insider" | "politician" | "institution";

export type TrackedInvestorRow = {
  id: string;
  name: string;
  type: TrackedInvestorType;
  typeLabel: string;
  amountUsd: number;
  amount: string;
  latestAt: string;
};

const TYPE_LABEL: Record<TrackedInvestorType, string> = {
  insider: "Insider",
  politician: "Politician",
  institution: "Institution",
};

function slugKey(name: string) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pushAgg(
  map: Map<string, { name: string; type: TrackedInvestorType; netUsd: number; latestAt: string }>,
  key: string,
  name: string,
  type: TrackedInvestorType,
  signedUsd: number,
  at: string,
) {
  if (!Number.isFinite(signedUsd) || signedUsd === 0) return;
  const prev = map.get(key) ?? { name, type, netUsd: 0, latestAt: at };
  prev.netUsd += signedUsd;
  if (at >= prev.latestAt) prev.latestAt = at;
  map.set(key, prev);
}

/** Net signed USD per tracked entity for a ticker (grouped by investor, newest activity first). */
export async function getTrackedInvestorsForTicker(
  ticker: string,
  limit = 24,
): Promise<TrackedInvestorRow[]> {
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase();
  if (!t) return [];

  const cap = Math.max(1, Math.min(60, limit));

  const [insiders, politicians, institutions] = await Promise.all([
    db.query<{
      insider_name: string;
      transaction_code: string | null;
      amount_usd: string | null;
      transaction_at: string;
    }>(
      `
      SELECT insider_name, transaction_code, amount_usd::text, transaction_at::text
      FROM insider_transactions
      WHERE upper(trim(ticker)) = $1
      ORDER BY transaction_at DESC
      `,
      [t],
    ),
    db.query<{
      politician_name: string;
      transaction_type: string | null;
      amount_usd_mid: string | null;
      transaction_at: string;
    }>(
      `
      SELECT politician_name, transaction_type, amount_usd_mid::text, transaction_at::text
      FROM politician_transactions
      WHERE upper(trim(ticker)) = $1
      ORDER BY transaction_at DESC
      `,
      [t],
    ),
    db.query<{
      filer: string;
      activity: string | null;
      amount_usd: string | null;
      filed_at: string;
    }>(
      `
      SELECT filer, activity, amount_usd::text, filed_at::text
      FROM institution_filings_13f
      WHERE upper(trim(ticker)) = $1
      ORDER BY filed_at DESC
      `,
      [t],
    ),
  ]);

  const map = new Map<string, { name: string; type: TrackedInvestorType; netUsd: number; latestAt: string }>();

  for (const row of insiders) {
    const sign = insiderTxnSign(row.transaction_code);
    if (!sign) continue;
    const amt = row.amount_usd != null ? Number(row.amount_usd) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const name = String(row.insider_name ?? "Insider").trim() || "Insider";
    const key = `insider|${slugKey(name)}`;
    pushAgg(map, key, name, "insider", sign * amt, row.transaction_at);
  }

  for (const row of politicians) {
    const sign = politicianTxnSign(row.transaction_type);
    if (!sign) continue;
    const amt = row.amount_usd_mid != null ? Number(row.amount_usd_mid) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const name = String(row.politician_name ?? "Politician").trim() || "Politician";
    const key = `politician|${slugKey(name)}`;
    pushAgg(map, key, name, "politician", sign * amt, row.transaction_at);
  }

  for (const row of institutions) {
    const sign = institutionActivitySign(row.activity);
    if (!sign) continue;
    const amt = row.amount_usd != null ? Number(row.amount_usd) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const name = String(row.filer ?? "Institution").trim() || "Institution";
    const key = `institution|${slugKey(name)}`;
    pushAgg(map, key, name, "institution", sign * amt, row.filed_at);
  }

  return [...map.values()]
    .filter((x) => x.netUsd !== 0)
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt) || Math.abs(b.netUsd) - Math.abs(a.netUsd))
    .slice(0, cap)
    .map((x) => ({
      id: `${x.type}|${slugKey(x.name)}`,
      name: x.name,
      type: x.type,
      typeLabel: TYPE_LABEL[x.type],
      amountUsd: x.netUsd,
      amount: formatUsdCompact(x.netUsd),
      latestAt: x.latestAt,
    }));
}
