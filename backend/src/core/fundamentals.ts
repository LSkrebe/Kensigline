/**
 * SEC Company Facts (XBRL) → historical fundamentals for the Research context panel.
 */

export type HistoricalFundamentals = {
  revenueGrowth: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
};

type FactRow = {
  val: number;
  end: string;
  filed: string;
  fy: number;
  fp: string;
  form: string;
};

const REVENUE_TAGS = [
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
];

const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"];

const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities"];

const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "CapitalExpendituresIncurredButNotYetPaid",
];

const FCF_TAGS = ["FreeCashFlow"];

function gaapFacts(companyFacts: unknown): Record<string, unknown> | null {
  const root = companyFacts as { facts?: Record<string, unknown> } | null;
  if (!root?.facts || typeof root.facts !== "object") return null;
  const gaap = root.facts["us-gaap"];
  return gaap && typeof gaap === "object" ? (gaap as Record<string, unknown>) : null;
}

function pickFactSeries(companyFacts: unknown, tagNames: string[]): FactRow[] {
  const gaap = gaapFacts(companyFacts);
  if (!gaap) return [];

  for (const tag of tagNames) {
    const fact = gaap[tag] as { units?: Record<string, unknown[]> } | undefined;
    const units = fact?.units;
    if (!units || typeof units !== "object") continue;

    for (const unitKey of Object.keys(units)) {
      const arr = units[unitKey];
      if (!Array.isArray(arr)) continue;

      const rows: FactRow[] = [];
      for (const raw of arr) {
        const r = raw as Record<string, unknown>;
        const val = Number(r?.val);
        const end = String(r?.end ?? "").trim();
        if (!Number.isFinite(val) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
        rows.push({
          val,
          end,
          filed: String(r?.filed ?? ""),
          fy: Number(r?.fy ?? 0),
          fp: String(r?.fp ?? "").trim().toUpperCase(),
          form: String(r?.form ?? "").trim().toUpperCase(),
        });
      }

      if (rows.length) return dedupeFactRowsByEnd(rows);
    }
  }

  return [];
}

/** Keep latest filing per period end. */
function dedupeFactRowsByEnd(rows: FactRow[]): FactRow[] {
  const byEnd = new Map<string, FactRow>();
  for (const r of rows) {
    const cur = byEnd.get(r.end);
    if (!cur || r.filed > cur.filed) byEnd.set(r.end, r);
  }
  return Array.from(byEnd.values()).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
}

function isQuarterlyRow(r: FactRow) {
  return r.fp.startsWith("Q") || r.form === "10-Q";
}

function pickLatestPeriodRow(rows: FactRow[]): FactRow | null {
  if (!rows.length) return null;
  const quarterly = rows.filter(isQuarterlyRow);
  const pool = quarterly.length ? quarterly : rows.filter((r) => r.form === "10-K" || r.fp === "FY");
  return pool[0] ?? rows[0] ?? null;
}

function priorYearRow(rows: FactRow[], anchor: FactRow): FactRow | null {
  const targetFy = anchor.fy > 0 ? anchor.fy - 1 : null;
  if (targetFy && anchor.fp) {
    const hit = rows.find((r) => r.fy === targetFy && r.fp === anchor.fp);
    if (hit) return hit;
  }

  const anchorEnd = new Date(`${anchor.end}T12:00:00.000Z`);
  if (Number.isNaN(anchorEnd.getTime())) return null;
  const targetEnd = new Date(anchorEnd);
  targetEnd.setUTCFullYear(targetEnd.getUTCFullYear() - 1);
  const target = targetEnd.toISOString().slice(0, 10);

  let best: FactRow | null = null;
  let bestDist = Infinity;
  for (const r of rows) {
    if (r.end === anchor.end) continue;
    const d = new Date(`${r.end}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) continue;
    const dist = Math.abs(d.getTime() - targetEnd.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  // Within ~45 days of YoY match
  if (best && bestDist <= 45 * 86_400_000) return best;
  return null;
}

function valueOnPeriod(rows: FactRow[], end: string): number | null {
  const hit = rows.find((r) => r.end === end);
  return hit && Number.isFinite(hit.val) ? hit.val : null;
}

function roundPct(n: number) {
  return Math.round(n * 10) / 10;
}

export function historicalFundamentalsFromCompanyFacts(companyFacts: unknown): HistoricalFundamentals {
  const revenueRows = pickFactSeries(companyFacts, REVENUE_TAGS);
  const netRows = pickFactSeries(companyFacts, NET_INCOME_TAGS);
  const ocfRows = pickFactSeries(companyFacts, OCF_TAGS);
  const capexRows = pickFactSeries(companyFacts, CAPEX_TAGS);
  const fcfRows = pickFactSeries(companyFacts, FCF_TAGS);

  const latestRev = pickLatestPeriodRow(revenueRows);
  if (!latestRev) {
    return {
      revenueGrowth: null,
      netMargin: null,
      fcfMargin: null,
      periodEnd: null,
      fiscalPeriod: null,
    };
  }

  const priorRev = priorYearRow(revenueRows, latestRev);
  let revenueGrowth: number | null = null;
  if (priorRev && priorRev.val !== 0) {
    revenueGrowth = roundPct(((latestRev.val - priorRev.val) / Math.abs(priorRev.val)) * 100);
  }

  const revenue = latestRev.val;
  const netIncome = valueOnPeriod(netRows, latestRev.end);
  let netMargin: number | null = null;
  if (netIncome != null && revenue !== 0) {
    netMargin = roundPct((netIncome / revenue) * 100);
  }

  let fcf: number | null = valueOnPeriod(fcfRows, latestRev.end);
  if (fcf == null) {
    const ocf = valueOnPeriod(ocfRows, latestRev.end);
    const capex = valueOnPeriod(capexRows, latestRev.end);
    if (ocf != null && capex != null) {
      fcf = ocf - Math.abs(capex);
    }
  }

  let fcfMargin: number | null = null;
  if (fcf != null && revenue !== 0) {
    fcfMargin = roundPct((fcf / revenue) * 100);
  }

  const fiscalPeriod =
    latestRev.fp && latestRev.fy ? `${latestRev.fp} FY${latestRev.fy}` : latestRev.form || null;

  return {
    revenueGrowth,
    netMargin,
    fcfMargin,
    periodEnd: latestRev.end,
    fiscalPeriod,
  };
}
