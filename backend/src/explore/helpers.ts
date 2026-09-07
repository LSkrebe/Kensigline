import { db } from "../core/db.js";

/** Explore home queries can be heavy; prod API pool is small and ingest competes for DB time. */
export const EXPLORE_HOME_QUERY_TIMEOUT_MS = 45_000;

export function exploreQueryApi<T = unknown>(
  text: string,
  params: unknown[] = [],
  timeoutMs = EXPLORE_HOME_QUERY_TIMEOUT_MS,
): Promise<T[]> {
  return db.queryApi<T>(text, params, timeoutMs);
}

/** Skip a single explore query under pool pressure instead of failing the whole payload. */
export async function tryExploreQuery<T>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[explore] ${label}_skipped`, msg);
    return [];
  }
}

export async function tryExploreBars(tickers: string[], maxPoints = 48): Promise<Map<string, number[]>> {
  try {
    return await loadBarClosesByTicker(tickers, maxPoints);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[explore] bars_skipped", msg);
    return new Map();
  }
}

export function todayUtcIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function formatTrailUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(Number(usd))) return "—";
  const v = Number(usd);
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "−";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) {
    const k = Math.round(abs / 1e3);
    if (k >= 1000) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return `${sign}$${k}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function formatTrailPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(Number(pct))) return "—";
  const v = Number(pct);
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function pctMoveFromCloses(closes: number[], lookback = 5): number | null {
  const arr = closes.filter(Number.isFinite);
  if (arr.length < 2) return null;
  const last = arr[arr.length - 1]!;
  const startIdx = Math.max(0, arr.length - 1 - lookback);
  const first = arr[startIdx]!;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

export async function loadBarClosesByTicker(tickers: string[], maxPoints = 260): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const uniq = [...new Set(tickers.map((t) => String(t ?? "").trim().toUpperCase()).filter(Boolean))].slice(0, 40);
  if (!uniq.length) return out;

  const rows = await exploreQueryApi<{ ticker: string; close: string }>(
    `
    SELECT ticker, close::text
    FROM (
      SELECT ticker, day, close,
             row_number() OVER (PARTITION BY ticker ORDER BY day DESC) AS rn
      FROM bars
      WHERE ticker = ANY($1::text[])
    ) x
    WHERE rn <= $2
    ORDER BY ticker ASC, rn DESC
    `,
    [uniq, maxPoints],
  );

  for (const row of rows) {
    const t = String(row.ticker ?? "").toUpperCase();
    const c = Number(row.close);
    if (!t || !Number.isFinite(c)) continue;
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push(c);
  }
  return out;
}

export function insiderSide(code: string | null, acquired: string | null): "buy" | "sell" | null {
  const c = String(code ?? "").trim().toUpperCase();
  const ad = String(acquired ?? "").trim().toUpperCase();
  if (c === "P" || c === "A" || ad === "A") return "buy";
  if (c === "S" || c === "D" || ad === "D") return "sell";
  return null;
}

export function politicianSide(type: string | null): "buy" | "sell" | null {
  const t = String(type ?? "").trim().toLowerCase();
  if (t.includes("purchase") || t.includes("buy")) return "buy";
  if (t.includes("sale") || t.includes("sell")) return "sell";
  return null;
}

export function institutionSide(activity: string | null): "buy" | "sell" | null {
  const a = String(activity ?? "").trim().toLowerCase();
  if (a.includes("add") || a.includes("increase") || a.includes("new")) return "buy";
  if (a.includes("trim") || a.includes("decrease") || a.includes("reduce") || a.includes("sold")) return "sell";
  return null;
}

/** 13F directory trail — share count or activity, not position market value. */
export function formatInstitutionTrail(activity: string | null, shares: number | null | undefined): string {
  if (shares != null && Number.isFinite(Number(shares)) && Number(shares) > 0) {
    const s = Number(shares);
    if (s >= 1e9) return `${(s / 1e9).toFixed(1)}B sh`;
    if (s >= 1e6) return `${(s / 1e6).toFixed(1)}M sh`;
    if (s >= 1e3) return `${Math.round(s / 1e3)}K sh`;
    return `${Math.round(s)} sh`;
  }
  const a = String(activity ?? "").trim().toLowerCase();
  if (a.includes("new")) return "New";
  if (a.includes("increase") || a.includes("add")) return "Added";
  if (a.includes("reduce") || a.includes("decrease") || a.includes("trim")) return "Trimmed";
  return "—";
}

export function insiderDocType(side: "buy" | "sell" | null): string {
  if (side === "buy") return "form4_purchase";
  if (side === "sell") return "form4_sale";
  return "form4";
}

export function politicianDocType(side: "buy" | "sell" | null): string {
  if (side === "buy") return "ptr_purchase";
  if (side === "sell") return "ptr_sale";
  return "ptr";
}

export function institutionDocType(side: "buy" | "sell" | null): string {
  if (side === "buy") return "13f_add";
  if (side === "sell") return "13f_trim";
  return "13f";
}

export function companyDocType(form: string | null, feedKind: string | null, title: string | null): string {
  const f = String(form ?? "").trim().toUpperCase();
  const t = String(title ?? "").trim().toLowerCase();
  if (f.startsWith("8-K")) {
    if (t.includes("earnings") || t.includes("results")) return "8k_earnings";
    return "8k";
  }
  if (f.startsWith("10-Q")) return "10q";
  if (f.startsWith("10-K")) return "10k";
  if (String(feedKind ?? "") === "research") {
    if (t.includes("transcript") || t.includes("call")) return "transcript";
    if (t.includes("guidance")) return "guidance";
    if (t.includes("earnings")) return "earnings";
    if (t.includes("proxy")) return "proxy";
    return "press";
  }
  return "8k";
}

export function recapDocLabel(mode: "insider" | "politicians" | "institutions" | "company", side: "buy" | "sell" | null): string {
  if (mode === "politicians") return "PTR";
  if (mode === "institutions") return "13F";
  if (mode === "company") return "8-K";
  return "Form 4";
}
