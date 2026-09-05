/** Shared SEC Company Facts (XBRL) row parsing for fundamentals and runway. */

export type FactRow = {
  val: number;
  end: string;
  start: string;
  filed: string;
  fy: number;
  fp: string;
  form: string;
  frame: string | null;
};

function gaapFacts(companyFacts: unknown): Record<string, unknown> | null {
  const root = companyFacts as { facts?: Record<string, unknown> } | null;
  if (!root?.facts || typeof root.facts !== "object") return null;
  const gaap = root.facts["us-gaap"];
  return gaap && typeof gaap === "object" ? (gaap as Record<string, unknown>) : null;
}

function periodSpanDays(row: FactRow): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start) || !/^\d{4}-\d{2}-\d{2}$/.test(row.end)) return null;
  const start = Date.parse(`${row.start}T12:00:00.000Z`);
  const end = Date.parse(`${row.end}T12:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Prefer single-quarter facts over YTD / multi-quarter spans when SEC duplicates the same fp+end. */
export function preferQuarterDurationRow(rows: FactRow[]): FactRow | null {
  if (!rows.length) return null;
  let best: FactRow | null = null;
  let bestScore = -Infinity;
  for (const row of rows) {
    let score = 0;
    const frame = String(row.frame ?? "").trim();
    if (/^CY\d{4}Q[1-4]$/i.test(frame)) score += 100;
    const span = periodSpanDays(row);
    if (span != null) {
      if (span >= 80 && span <= 100) score += 50;
      else if (span >= 170 && span <= 190) score += 10;
      else if (span >= 350) score -= 40;
    }
    if (row.form === "10-Q") score += 5;
    if (row.filed) score += Date.parse(`${row.filed}T12:00:00.000Z`) / 1e15;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function dedupeFactRowsByEnd(rows: FactRow[]): FactRow[] {
  const byEnd = new Map<string, FactRow[]>();
  for (const r of rows) {
    const list = byEnd.get(r.end) ?? [];
    list.push(r);
    byEnd.set(r.end, list);
  }
  const out: FactRow[] = [];
  for (const group of byEnd.values()) {
    const picked = preferQuarterDurationRow(group);
    if (picked) out.push(picked);
  }
  return out.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
}

export function pickFactSeries(companyFacts: unknown, tagNames: string[]): FactRow[] {
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
          start: String(r?.start ?? "").trim(),
          filed: String(r?.filed ?? ""),
          fy: Number(r?.fy ?? 0),
          fp: String(r?.fp ?? "").trim().toUpperCase(),
          form: String(r?.form ?? "").trim().toUpperCase(),
          frame: r?.frame != null ? String(r.frame).trim() : null,
        });
      }

      if (rows.length) return dedupeFactRowsByEnd(rows);
    }
  }

  return [];
}

function isQuarterlyRow(r: FactRow) {
  return r.fp.startsWith("Q") || r.form === "10-Q";
}

export function pickLatestPeriodRow(rows: FactRow[]): FactRow | null {
  if (!rows.length) return null;
  const quarterly = rows.filter(isQuarterlyRow);
  const pool = quarterly.length ? quarterly : rows.filter((r) => r.form === "10-K" || r.fp === "FY");
  return pool[0] ?? rows[0] ?? null;
}

export function priorYearRow(rows: FactRow[], anchor: FactRow): FactRow | null {
  const targetFy = anchor.fy > 0 ? anchor.fy - 1 : null;
  if (targetFy && anchor.fp) {
    const hit = rows.find((r) => r.fy === targetFy && r.fp === anchor.fp);
    if (hit) return hit;
  }

  const anchorEnd = new Date(`${anchor.end}T12:00:00.000Z`);
  if (Number.isNaN(anchorEnd.getTime())) return null;
  const targetEnd = new Date(anchorEnd);
  targetEnd.setUTCFullYear(targetEnd.getUTCFullYear() - 1);

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
  if (best && bestDist <= 45 * 86_400_000) return best;
  return null;
}

export function valueOnPeriod(rows: FactRow[], end: string): number | null {
  const hits = rows.filter((r) => r.end === end);
  if (!hits.length) return null;
  const hit = hits.length === 1 ? hits[0]! : preferQuarterDurationRow(hits);
  return hit && Number.isFinite(hit.val) ? hit.val : null;
}

export function fiscalPeriodLabel(row: FactRow | null): string | null {
  if (!row) return null;
  return row.fp && row.fy ? `${row.fp} FY${row.fy}` : row.form || null;
}

export function fyShortLabel(fy: number): string {
  const yy = fy % 100;
  return `FY${String(yy).padStart(2, "0")}`;
}

export function quarterShortLabel(row: FactRow, estimate = false): string {
  const fpRaw = String(row.fp ?? "").trim().toUpperCase();
  const fp = fpRaw.startsWith("Q") ? fpRaw : fpRaw ? `Q${fpRaw}` : "Q?";
  const endYear = Number(String(row.end).slice(0, 4));
  const yy = (Number.isFinite(endYear) && endYear > 0 ? endYear : row.fy) % 100;
  return `${fp}'${String(yy).padStart(2, "0")}${estimate ? "E" : ""}`;
}

/** Quarterly rows, one per fiscal period, oldest → newest. */
export function pickQuarterlyRows(rows: FactRow[], count: number): FactRow[] {
  if (!rows.length || count <= 0) return [];

  const quarterly = rows.filter(isQuarterlyRow);
  const pool = quarterly.length ? quarterly : rows;

  const byKey = new Map<string, FactRow[]>();
  for (const r of pool) {
    const endYear = Number(String(r.end).slice(0, 4));
    const fp = String(r.fp ?? "").trim().toUpperCase() || "Q?";
    const key = `${endYear}:${fp}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  const picked = Array.from(byKey.values())
    .map((group) => preferQuarterDurationRow(group))
    .filter((r): r is FactRow => r != null)
    .sort((a, b) => a.end.localeCompare(b.end))
    .slice(-count);

  return picked;
}

/** Annual 10-K / FY rows, one per fiscal year, oldest → newest. */
export function pickAnnualFyRows(rows: FactRow[], count: number): FactRow[] {
  if (!rows.length || count <= 0) return [];

  const annual = rows.filter((r) => r.fp === "FY" || r.form === "10-K");
  const pool = annual.length ? annual : rows.filter((r) => r.fp === "Q4" || r.fp.endsWith("Q4"));

  const byFy = new Map<number, FactRow>();
  for (const r of pool) {
    const fy = r.fy > 0 ? r.fy : Number(String(r.end).slice(0, 4));
    if (!Number.isFinite(fy) || fy <= 0) continue;
    const cur = byFy.get(fy);
    if (!cur || r.end > cur.end || (r.end === cur.end && r.filed > cur.filed)) byFy.set(fy, { ...r, fy });
  }

  return Array.from(byFy.values())
    .sort((a, b) => a.fy - b.fy)
    .slice(-count);
}

export function nearestRowOnOrBefore(rows: FactRow[], isoDate: string): FactRow | null {
  if (!rows.length || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  let best: FactRow | null = null;
  for (const r of rows) {
    if (r.end <= isoDate && (!best || r.end > best.end)) best = r;
  }
  return best;
}

export function roundOneDecimal(n: number) {
  return Math.round(n * 10) / 10;
}
