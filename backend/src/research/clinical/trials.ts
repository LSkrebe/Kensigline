const CTG_BASE = "https://clinicaltrials.gov/api/v2/studies";

type DateStruct = { date?: string; type?: string } | null | undefined;

export type CtgStudy = {
  nctId: string;
  briefTitle: string;
  overallStatus: string;
  sponsor: string | null;
  phases: string[];
  conditions: string[];
  interventions: string[];
  startDate: string | null;
  primaryCompletionDate: string | null;
  primaryCompletionType: string | null;
  completionDate: string | null;
  completionType: string | null;
  url: string;
};

type CacheEntry = { at: number; studies: CtgStudy[] };
const studyCache = new Map<string, CacheEntry>();

let lastFetchAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ctgRateLimit() {
  const minMs = Math.max(100, Number(process.env.CLINICAL_TRIALS_MIN_INTERVAL_MS ?? 250));
  const now = Date.now();
  const wait = lastFetchAt ? Math.max(0, minMs - (now - lastFetchAt)) : 0;
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

function isoDay(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseDateStruct(s: DateStruct): { day: string | null; type: string | null } {
  const day = String(s?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { day: null, type: null };
  return { day, type: s?.type ? String(s.type) : null };
}

function normalizePhase(phases: string[]): string | null {
  const xs = (phases ?? []).map((p) => String(p).toUpperCase());
  if (xs.some((p) => p.includes("PHASE3") || p === "PHASE 3")) return "Phase 3";
  if (xs.some((p) => p.includes("PHASE2") || p === "PHASE 2")) return "Phase 2";
  if (xs.some((p) => p.includes("PHASE1") || p === "PHASE 1")) return "Phase 1";
  if (xs.some((p) => p.includes("PHASE4") || p === "PHASE 4")) return "Phase 4";
  return phases.length ? phases.map((p) => p.replace(/_/g, " ")).join(", ") : null;
}

function phaseRank(phase: string | null) {
  const s = String(phase ?? "").toLowerCase();
  if (s.includes("3")) return 3;
  if (s.includes("2")) return 2;
  if (s.includes("1")) return 1;
  if (s.includes("4")) return 4;
  return 0;
}

function isActiveStatus(status: string) {
  const s = String(status ?? "").toUpperCase();
  return (
    s === "RECRUITING" ||
    s === "ACTIVE_NOT_RECRUITING" ||
    s === "NOT_YET_RECRUITING" ||
    s === "ENROLLING_BY_INVITATION" ||
    s === "AVAILABLE" ||
    s === "UNKNOWN"
  );
}

function normalizeDrugKey(k: string) {
  const s = String(k ?? "").trim();
  if (!s) return s;
  if (/^[A-Z][A-Z0-9-]*$/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Strip dose/route suffixes from intervention names. */
export function interventionDrugKey(name: string): string | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  if (/^placebo$/i.test(raw)) return null;
  const m = raw.match(/^([A-Za-z][A-Za-z0-9-]*)/);
  const key = m ? m[1]! : raw.split(/\s+/)[0] ?? null;
  return key ? normalizeDrugKey(key) : null;
}

export function pickStudyDrug(study: CtgStudy): string | null {
  for (const iv of study.interventions) {
    const k = interventionDrugKey(iv);
    if (k) return k;
  }
  return null;
}

function parseStudy(json: any): CtgStudy | null {
  const ps = json?.protocolSection;
  const nctId = String(ps?.identificationModule?.nctId ?? "").trim();
  if (!nctId) return null;

  const sm = ps?.statusModule ?? {};
  const start = parseDateStruct(sm.startDateStruct);
  const primary = parseDateStruct(sm.primaryCompletionDateStruct);
  const completion = parseDateStruct(sm.completionDateStruct);

  const interventions = Array.isArray(ps?.armsInterventionsModule?.interventions)
    ? ps.armsInterventionsModule.interventions
        .map((x: any) => String(x?.name ?? "").trim())
        .filter(Boolean)
    : [];

  const conditions = Array.isArray(ps?.conditionsModule?.conditions)
    ? ps.conditionsModule.conditions.map((c: unknown) => String(c ?? "").trim()).filter(Boolean)
    : [];

  const phases = Array.isArray(ps?.designModule?.phases)
    ? ps.designModule.phases.map((p: unknown) => String(p ?? "").trim()).filter(Boolean)
    : [];

  const sponsor = ps?.identificationModule?.organization?.fullName
    ? String(ps.identificationModule.organization.fullName).trim()
    : null;

  return {
    nctId,
    briefTitle: String(ps?.identificationModule?.briefTitle ?? "").trim() || nctId,
    overallStatus: String(sm.overallStatus ?? "").trim() || "UNKNOWN",
    sponsor,
    phases,
    conditions,
    interventions,
    startDate: start.day,
    primaryCompletionDate: primary.day,
    primaryCompletionType: primary.type,
    completionDate: completion.day,
    completionType: completion.type,
    url: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

async function fetchStudiesPage(query: string, pageSize: number): Promise<CtgStudy[]> {
  await ctgRateLimit();
  const url = new URL(CTG_BASE);
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(100, pageSize))));
  url.searchParams.set("format", "json");
  // `query.term` matches sponsor names, tickers, NCT ids, and keywords.
  url.searchParams.set("query.term", query);

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`clinicaltrials_failed ${res.status} ${txt.slice(0, 200)}`);

  const json = JSON.parse(txt) as { studies?: unknown[] };
  const studies = Array.isArray(json.studies) ? json.studies : [];
  const out: CtgStudy[] = [];
  for (const s of studies) {
    const parsed = parseStudy(s);
    if (parsed) out.push(parsed);
  }
  return out;
}

function dedupeStudies(studies: CtgStudy[]) {
  const byNct = new Map<string, CtgStudy>();
  for (const s of studies) byNct.set(s.nctId, s);
  return Array.from(byNct.values());
}

function companyNameMatchTokens(name: string): string[] {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[,./()]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !/^(inc|corp|ltd|llc|limited|company|co|the|and|plc|nv|sa)$/.test(w));
}

function studyMatchesCompany(study: CtgStudy, ticker: string, companyName: string): boolean {
  const tick = String(ticker ?? "").trim().toLowerCase();
  const sponsor = String(study.sponsor ?? "").toLowerCase();
  const title = study.briefTitle.toLowerCase();
  const blob = `${sponsor} ${title}`;
  if (tick && (sponsor.includes(tick) || title.includes(tick))) return true;
  const tokens = companyNameMatchTokens(companyName);
  if (!tokens.length) return true;
  const hits = tokens.filter((t) => blob.includes(t));
  const need = Math.min(2, tokens.length);
  return hits.length >= need;
}

export async function fetchClinicalStudiesForCompany(opts: {
  ticker: string;
  companyName?: string | null;
}): Promise<CtgStudy[]> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) return [];

  const name = String(opts.companyName ?? "").trim();
  const cacheKey = `${ticker}|${name.toLowerCase()}`;
  const ttl = Math.max(60_000, Number(process.env.CLINICAL_TRIALS_CACHE_MS ?? 30 * 60_000));
  const hit = studyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttl) return hit.studies;

  const queries: string[] = [];
  if (name.length >= 3) queries.push(name);
  queries.push(ticker);

  const pageSize = Math.max(5, Math.min(100, Number(process.env.CLINICAL_TRIALS_PAGE_SIZE ?? 40)));
  let merged: CtgStudy[] = [];
  for (const q of queries) {
    try {
      const page = await fetchStudiesPage(q, pageSize);
      merged = dedupeStudies([...merged, ...page]);
      if (merged.length >= pageSize) break;
    } catch (e) {
      console.error("clinicaltrials_fetch_failed", ticker, q, e);
    }
  }

  // Prefer studies where sponsor/title match company tokens; never fall back to unrelated trials.
  const filtered = merged.filter((s) => studyMatchesCompany(s, ticker, name));
  const studies = name.length >= 3 ? filtered : filtered.length ? filtered : merged;
  studyCache.set(cacheKey, { at: Date.now(), studies });
  return studies;
}

export type ClinicalMilestone = {
  at: string;
  label: string;
  url: string;
  nctId: string;
};

export type ClinicalProgram = {
  key: string;
  indication: string | null;
  stage: string | null;
  milestones: ClinicalMilestone[];
  nctIds: string[];
};

export type ClinicalCatalystItem = {
  id: string;
  kind: "trial" | "earnings";
  programKey: string;
  label: string;
  at: string | null;
  phase: string | null;
  url: string | null;
  nctId?: string | null;
};

function dayStartMs(isoDay: string) {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function isUpcomingDay(isoDay: string, gracePastDays = 1) {
  const t = dayStartMs(isoDay);
  if (!Number.isFinite(t)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t >= today.getTime() - gracePastDays * 86_400_000;
}

function milestonesForStudy(study: CtgStudy): ClinicalMilestone[] {
  const rows: ClinicalMilestone[] = [];

  if (study.primaryCompletionDate) {
    rows.push({
      at: study.primaryCompletionDate,
      label: "Primary completion",
      url: study.url,
      nctId: study.nctId,
    });
  }
  if (study.completionDate && study.completionDate !== study.primaryCompletionDate) {
    rows.push({
      at: study.completionDate,
      label: "Study completion",
      url: study.url,
      nctId: study.nctId,
    });
  }
  if (study.startDate && isActiveStatus(study.overallStatus)) {
    rows.push({
      at: study.startDate,
      label: "Study start",
      url: study.url,
      nctId: study.nctId,
    });
  }
  return rows;
}

export function buildProgramsFromStudies(studies: CtgStudy[]): ClinicalProgram[] {
  const byDrug = new Map<string, ClinicalProgram>();

  for (const study of studies) {
    const drug = pickStudyDrug(study) ?? study.nctId;
    const phase = normalizePhase(study.phases);
    const indication = study.conditions[0] ?? null;
    const prev = byDrug.get(drug) ?? {
      key: drug,
      indication,
      stage: phase,
      milestones: [],
      nctIds: [],
    };
    if (!prev.indication && indication) prev.indication = indication;
    if (phaseRank(phase) > phaseRank(prev.stage)) prev.stage = phase;
    if (!prev.nctIds.includes(study.nctId)) prev.nctIds.push(study.nctId);
    prev.milestones.push(...milestonesForStudy(study));
    byDrug.set(drug, prev);
  }

  for (const p of byDrug.values()) {
    const seen = new Set<string>();
    p.milestones = p.milestones
      .filter((m) => {
        const k = `${m.at}|${m.label}|${m.nctId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return Boolean(m.at && m.label);
      })
      .sort((a, b) => dayStartMs(a.at) - dayStartMs(b.at));
  }

  return Array.from(byDrug.values()).sort((a, b) => {
    const d = phaseRank(b.stage) - phaseRank(a.stage);
    if (d !== 0) return d;
    return a.key.localeCompare(b.key);
  });
}

export function buildCatalystsFromStudies(
  studies: CtgStudy[],
  opts?: { earningsDate?: string | null; limit?: number },
): ClinicalCatalystItem[] {
  const limit = Math.max(1, Math.min(20, Number(opts?.limit ?? 6)));
  const rows: ClinicalCatalystItem[] = [];

  const earningsDate = String(opts?.earningsDate ?? "").trim();
  if (earningsDate && /^\d{4}-\d{2}-\d{2}$/.test(earningsDate) && isUpcomingDay(earningsDate, 0)) {
    rows.push({
      id: `earnings`,
      kind: "earnings",
      programKey: "Earnings",
      label: "Earnings report",
      at: earningsDate,
      phase: null,
      url: null,
      nctId: null,
    });
  }

  for (const study of studies) {
    const drug = pickStudyDrug(study);
    const programKey = drug ?? study.nctId;
    const phase = normalizePhase(study.phases);
    const active = isActiveStatus(study.overallStatus);

    if (study.primaryCompletionDate && isUpcomingDay(study.primaryCompletionDate)) {
      rows.push({
        id: `${study.nctId}:primary`,
        kind: "trial",
        programKey,
        label: active ? "Primary completion" : "Primary completion (est.)",
        at: study.primaryCompletionDate,
        phase,
        url: study.url,
        nctId: study.nctId,
      });
    }
    if (
      study.completionDate &&
      study.completionDate !== study.primaryCompletionDate &&
      isUpcomingDay(study.completionDate)
    ) {
      rows.push({
        id: `${study.nctId}:completion`,
        kind: "trial",
        programKey,
        label: active ? "Study completion" : "Study completion (est.)",
        at: study.completionDate,
        phase,
        url: study.url,
        nctId: study.nctId,
      });
    }
  }

  const dated = rows.filter((r) => r.at).sort((a, b) => dayStartMs(a.at!) - dayStartMs(b.at!));
  const undated: ClinicalCatalystItem[] = [];

  if (dated.length + undated.length < limit) {
    const usedNct = new Set(dated.filter((d) => d.nctId).map((d) => String(d.nctId)));
    for (const study of studies) {
      if (!isActiveStatus(study.overallStatus)) continue;
      if (usedNct.has(study.nctId)) continue;
      const drug = pickStudyDrug(study);
      undated.push({
        id: `${study.nctId}:active`,
        kind: "trial",
        programKey: drug ?? study.nctId,
        label: study.overallStatus === "RECRUITING" ? "Recruiting" : "Trial active",
        at: null,
        phase: normalizePhase(study.phases),
        url: study.url,
        nctId: study.nctId,
      });
      usedNct.add(study.nctId);
      if (dated.length + undated.length >= limit) break;
    }
  }

  return [...dated, ...undated].slice(0, limit);
}

export function pickLeadProgram(
  programs: ClinicalProgram[],
  catalysts: ClinicalCatalystItem[],
): { name: string; indication: string | null; stage: string | null; next: string | null } | null {
  if (!programs.length) return null;
  const lead = programs[0]!;
  const nextTrial = catalysts.find((c) => c.kind === "trial" && c.programKey === lead.key && c.at);
  const next =
    (nextTrial?.at ? String(nextTrial.at) : null) ??
    lead.milestones.filter((m) => isUpcomingDay(m.at)).sort((a, b) => dayStartMs(a.at) - dayStartMs(b.at))[0]?.at ??
    null;
  return {
    name: lead.key,
    indication: lead.indication,
    stage: lead.stage,
    next,
  };
}
