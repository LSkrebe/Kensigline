import { db } from "../core/db.js";

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
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
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

  const rows = await db.queryApi<{ ticker: string; close: string }>(
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
