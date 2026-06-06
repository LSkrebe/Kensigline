/** Shared SEC Company Facts (XBRL) row parsing for fundamentals and runway. */

export type FactRow = {
  val: number;
  end: string;
  filed: string;
  fy: number;
  fp: string;
  form: string;
};

function gaapFacts(companyFacts: unknown): Record<string, unknown> | null {
  const root = companyFacts as { facts?: Record<string, unknown> } | null;
  if (!root?.facts || typeof root.facts !== "object") return null;
  const gaap = root.facts["us-gaap"];
  return gaap && typeof gaap === "object" ? (gaap as Record<string, unknown>) : null;
}

function dedupeFactRowsByEnd(rows: FactRow[]): FactRow[] {
  const byEnd = new Map<string, FactRow>();
  for (const r of rows) {
    const cur = byEnd.get(r.end);
    if (!cur || r.filed > cur.filed) byEnd.set(r.end, r);
  }
  return Array.from(byEnd.values()).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
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
  const hit = rows.find((r) => r.end === end);
  return hit && Number.isFinite(hit.val) ? hit.val : null;
}

export function fiscalPeriodLabel(row: FactRow | null): string | null {
  if (!row) return null;
  return row.fp && row.fy ? `${row.fp} FY${row.fy}` : row.form || null;
}

export function roundOneDecimal(n: number) {
  return Math.round(n * 10) / 10;
}
