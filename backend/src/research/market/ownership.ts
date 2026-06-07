import { reportingOwnersFromOwnershipXml } from "../../core/form-ownership.js";
import { fundamentalsSeriesFromCompanyFacts } from "../../core/fundamentals.js";
import { fetchForm4Text, fetchSecJson, resolveCikForTicker } from "../../core/sec.js";
import {
  loadInsiderOwnershipFilingsForTicker,
  loadInstitutionShareSnapshotsForTicker,
} from "../../documents/store.js";
import { roundOneDecimal } from "../../core/xbrl-facts.js";

export type MarketOwnership = {
  insiders: (number | null)[];
  institutions: (number | null)[];
  politicians: (number | null)[];
  sources: {
    insiders: "sec_form35" | null;
    institutions: "sec_13f" | null;
    politicians: null;
  };
};

const EMPTY: MarketOwnership = {
  insiders: [null, null, null, null],
  institutions: [null, null, null, null],
  politicians: [null, null, null, null],
  sources: { insiders: null, institutions: null, politicians: null },
};

type CalendarQuarter = { year: number; quarter: number; end: string };

function calendarQuarterEnd(year: number, quarter: number): string {
  const month = quarter * 3;
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function trailingCalendarQuarters(count: number, asOf = new Date()): CalendarQuarter[] {
  let year = asOf.getUTCFullYear();
  let quarter = Math.floor(asOf.getUTCMonth() / 3) + 1;
  const out: CalendarQuarter[] = [];

  for (let i = 0; i < count; i++) {
    out.unshift({ year, quarter, end: calendarQuarterEnd(year, quarter) });
    quarter -= 1;
    if (quarter < 1) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

function quarterBucket(iso: string, quarters: CalendarQuarter[]): number {
  const day = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return -1;
  for (let i = 0; i < quarters.length; i++) {
    if (day <= quarters[i]!.end) return i;
  }
  return -1;
}

function pctOfFloat(sharesHeld: number | null, floatShares: number | null): number | null {
  if (sharesHeld == null || floatShares == null || floatShares <= 0) return null;
  return roundOneDecimal((sharesHeld / floatShares) * 100);
}

function quarterlySharesOutstanding(companyFacts: unknown, quarters: CalendarQuarter[]): (number | null)[] {
  const series = fundamentalsSeriesFromCompanyFacts(companyFacts, { periods: 8 });
  if (!series.periodEnds.length) return quarters.map(() => null);

  return quarters.map((q) => {
    let bestIdx = -1;
    let bestEnd = "";
    for (let i = 0; i < series.periodEnds.length; i++) {
      const end = series.periodEnds[i]!;
      if (end <= q.end && end > bestEnd) {
        bestEnd = end;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? (series.sharesOutstanding[bestIdx] ?? null) : null;
  });
}

function aggregateInstitutionPctByQuarter(
  snapshots: Awaited<ReturnType<typeof loadInstitutionShareSnapshotsForTicker>>,
  quarters: CalendarQuarter[],
  floatByQuarter: (number | null)[],
): (number | null)[] {
  const buckets = quarters.map(() => new Map<string, { shares: number; asOf: string }>());

  for (const snap of snapshots) {
    const idx = quarterBucket(snap.asOf, quarters);
    if (idx < 0) continue;
    const prev = buckets[idx]!.get(snap.filer);
    if (!prev || snap.asOf >= prev.asOf) {
      buckets[idx]!.set(snap.filer, { shares: snap.shares, asOf: snap.asOf });
    }
  }

  return quarters.map((_, i) => {
    let total = 0;
    for (const row of buckets[i]!.values()) total += row.shares;
    return total > 0 ? pctOfFloat(total, floatByQuarter[i] ?? null) : null;
  });
}

async function aggregateInsiderPctByQuarter(
  filings: Awaited<ReturnType<typeof loadInsiderOwnershipFilingsForTicker>>,
  quarters: CalendarQuarter[],
  floatByQuarter: (number | null)[],
): Promise<{ values: (number | null)[]; hasData: boolean }> {
  const xmlCache = new Map<string, ReturnType<typeof reportingOwnersFromOwnershipXml>>();
  const maxFetches = 16;
  const urls = [...new Set(filings.map((f) => f.url))].slice(0, maxFetches);

  for (const url of urls) {
    try {
      const xml = await fetchForm4Text(url);
      xmlCache.set(url, reportingOwnersFromOwnershipXml(xml));
    } catch {
      xmlCache.set(url, []);
    }
  }

  const pctValues = quarters.map((q, qi) => {
    const ownerBest = new Map<string, { shares: number; eventAt: string }>();
    for (const filing of filings) {
      if (String(filing.eventAt).slice(0, 10) > q.end) continue;
      const owners = xmlCache.get(filing.url);
      if (!owners?.length) continue;
      for (const o of owners) {
        const prev = ownerBest.get(o.owner);
        if (!prev || filing.eventAt >= prev.eventAt) {
          ownerBest.set(o.owner, { shares: o.shares, eventAt: filing.eventAt });
        }
      }
    }
    let total = 0;
    for (const row of ownerBest.values()) total += row.shares;
    return total > 0 ? pctOfFloat(total, floatByQuarter[qi] ?? null) : null;
  });

  const hasData = pctValues.some((v) => v != null);
  return { values: pctValues, hasData };
}

/** Research CONTEXT panel ownership — 13F institutions + Form 3/5 insiders. */
export async function getMarketOwnershipForTicker(opts: { ticker: string }): Promise<MarketOwnership> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) return { ...EMPTY };

  const quarters = trailingCalendarQuarters(4);

  let floatByQuarter: (number | null)[] = quarters.map(() => null);
  try {
    const { cik } = await resolveCikForTicker(ticker);
    const facts = await fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    floatByQuarter = quarterlySharesOutstanding(facts, quarters);
  } catch {
    // institutions may still compute if shares exist on snapshots only
  }

  let institutions: (number | null)[] = [null, null, null, null];
  let institutionsSource: "sec_13f" | null = null;
  try {
    const snapshots = await loadInstitutionShareSnapshotsForTicker(ticker);
    institutions = aggregateInstitutionPctByQuarter(snapshots, quarters, floatByQuarter);
    if (institutions.some((v) => v != null)) institutionsSource = "sec_13f";
  } catch {
    institutions = [null, null, null, null];
  }

  let insiders: (number | null)[] = [null, null, null, null];
  let insidersSource: "sec_form35" | null = null;
  try {
    const filings = await loadInsiderOwnershipFilingsForTicker(ticker);
    if (filings.length) {
      const { values, hasData } = await aggregateInsiderPctByQuarter(filings, quarters, floatByQuarter);
      insiders = values;
      if (hasData) insidersSource = "sec_form35";
    }
  } catch {
    insiders = [null, null, null, null];
  }

  return {
    insiders,
    institutions,
    politicians: [null, null, null, null],
    sources: {
      insiders: insidersSource,
      institutions: institutionsSource,
      politicians: null,
    },
  };
}
