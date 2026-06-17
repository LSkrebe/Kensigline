import { db } from "../../core/db.js";
import { getCompanyPanelData } from "../../core/company.js";
import { getClinicalRunwayForTicker, type ClinicalRunway } from "./runway.js";
import {
  buildCatalystsFromStudies,
  buildProgramsFromStudies,
  fetchClinicalStudiesForCompany,
  interventionDrugKey,
  pickLeadProgram,
  type ClinicalCatalystItem,
  type ClinicalMilestone,
  type ClinicalProgram,
} from "./trials.js";

function isoDayFromDbEventAt(raw: string | Date | null | undefined): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function ensurePipelineProgramFromFilings(
  programs: ClinicalProgram[],
  rows: Array<{
    event_at: string | Date | null;
    feed_label: string | null;
    program_drug: string | null;
    url: string | null;
  }>,
): ClinicalProgram[] {
  if (programs.length) return programs;
  const milestones: ClinicalMilestone[] = [];
  for (const r of rows) {
    const at = isoDayFromDbEventAt(r.event_at);
    if (!at) continue;
    const label = String(r.feed_label ?? "Filing update").trim() || "Filing update";
    const url = r.url ? String(r.url) : "https://www.sec.gov/edgar/search/";
    milestones.push({ at, label, url, nctId: "sec" });
  }
  if (!milestones.length) return programs;
  return [
    {
      key: "Pipeline",
      indication: null,
      stage: null,
      milestones: milestones
        .filter((m, i, arr) => arr.findIndex((x) => x.at === m.at && x.label === m.label) === i)
        .sort((a, b) => a.at.localeCompare(b.at)),
      nctIds: [],
    },
  ];
}

function mergeFilingMilestonesIntoPrograms(
  programs: ClinicalProgram[],
  rows: Array<{
    event_at: string | Date | null;
    feed_label: string | null;
    program_drug: string | null;
    url: string | null;
  }>,
): ClinicalProgram[] {
  const byKey = new Map(programs.map((p) => [p.key.toLowerCase(), { ...p, milestones: [...p.milestones] }]));

  for (const r of rows) {
    const drugRaw = String(r.program_drug ?? "").trim();
    const key = interventionDrugKey(drugRaw) ?? drugRaw;
    if (!key) continue;
    const at = isoDayFromDbEventAt(r.event_at);
    if (!at) continue;
    const label = String(r.feed_label ?? "Filing update").trim() || "Filing update";
    const url = r.url ? String(r.url) : "https://www.sec.gov/edgar/search/";
    const prev =
      byKey.get(key.toLowerCase()) ??
      ({
        key,
        indication: null,
        stage: null,
        milestones: [],
        nctIds: [],
      } satisfies ClinicalProgram);
    const milestone: ClinicalMilestone = { at, label, url, nctId: "sec" };
    prev.milestones.push(milestone);
    byKey.set(key.toLowerCase(), prev);
  }

  return Array.from(byKey.values()).map((p) => ({
    ...p,
    milestones: p.milestones
      .filter((m, i, arr) => arr.findIndex((x) => x.at === m.at && x.label === m.label) === i)
      .sort((a, b) => a.at.localeCompare(b.at)),
  }));
}

async function resolveCompanyName(ticker: string, panelName: string | null): Promise<string | null> {
  if (panelName) return panelName;
  const row = await db.one<{ name: string | null }>(`SELECT name FROM companies WHERE ticker = $1 LIMIT 1`, [ticker]);
  return row?.name ? String(row.name).trim() || null : null;
}

export async function getPharmaClinicalContext(opts: {
  ticker: string;
  catalystLimit?: number;
}): Promise<{
  ticker: string;
  company_name: string | null;
  earnings_date: string | null;
  lead: { name: string; indication: string | null; stage: string | null; next: string | null } | null;
  catalysts: ClinicalCatalystItem[];
  programs: ClinicalProgram[];
  trials_count: number;
  runway: ClinicalRunway;
}> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker_required");

  let earnings_date: string | null = null;
  let panelName: string | null = null;
  try {
    const panel = await getCompanyPanelData({ ticker });
    earnings_date = panel.earnings_date ?? null;
    panelName = panel.name ? String(panel.name).trim() : null;
  } catch {
    earnings_date = null;
    panelName = null;
  }

  const companyName = await resolveCompanyName(ticker, panelName);

  const filingRows = await db.query<{
    event_at: string | null;
    feed_label: string | null;
    program_drug: string | null;
    url: string | null;
  }>(
    `
    SELECT event_at::text, feed_label, program_drug, url
    FROM documents
    WHERE feed_kind = 'pharma'
      AND upper(trim(ticker)) = $1
      AND event_at IS NOT NULL
    ORDER BY event_at DESC
    LIMIT 80
    `,
    [ticker],
  );

  // SEC pharma filings (program_drug) are the source of truth for our ingest; CT.gov supplements.
  let programs = mergeFilingMilestonesIntoPrograms([], filingRows);

  const studies = await fetchClinicalStudiesForCompany({ ticker, companyName });
  programs = mergeFilingMilestonesIntoPrograms(buildProgramsFromStudies(studies), filingRows);
  programs = ensurePipelineProgramFromFilings(programs, filingRows);

  programs.sort((a, b) => {
    const aSec = a.milestones.some((m) => m.nctId === "sec") ? 1 : 0;
    const bSec = b.milestones.some((m) => m.nctId === "sec") ? 1 : 0;
    if (bSec !== aSec) return bSec - aSec;
    return a.key.localeCompare(b.key);
  });

  const catalysts = buildCatalystsFromStudies(studies, {
    earningsDate: earnings_date,
    limit: opts.catalystLimit ?? 6,
  });
  const lead = pickLeadProgram(programs, catalysts);

  let runway: ClinicalRunway = {
    cashUsd: null,
    quarterlyBurnUsd: null,
    runwayQuarters: null,
    periodEnd: null,
    fiscalPeriod: null,
    source: null,
  };
  try {
    runway = await getClinicalRunwayForTicker({ ticker });
  } catch {
    runway = {
      cashUsd: null,
      quarterlyBurnUsd: null,
      runwayQuarters: null,
      periodEnd: null,
      fiscalPeriod: null,
      source: null,
    };
  }

  return {
    ticker,
    company_name: companyName,
    earnings_date,
    lead,
    catalysts,
    programs,
    trials_count: studies.length,
    runway,
  };
}
