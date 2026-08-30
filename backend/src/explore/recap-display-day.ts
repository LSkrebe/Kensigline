/** Match frontend resolveExploreDisplayDay / scopeRecapDayToDisplayDay (UTC). */

export function todayUtcIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function resolveExploreDisplayDay(
  dates: string[],
  opts: { today?: string; maxLookback?: number } = {},
): { displayDayKey: string; requestedDayKey: string; isFallback: boolean } {
  const today = opts.today ?? todayUtcIso();
  const maxLookback = Math.max(0, opts.maxLookback ?? 14);
  const dateSet = new Set(
    dates.map((d) => String(d ?? "").slice(0, 10)).filter(Boolean),
  );

  if (dateSet.has(today)) {
    return { displayDayKey: today, requestedDayKey: today, isFallback: false };
  }

  for (let i = 1; i <= maxLookback; i += 1) {
    const candidate = isoDaysBefore(today, i);
    if (dateSet.has(candidate)) {
      return { displayDayKey: candidate, requestedDayKey: today, isFallback: true };
    }
  }

  const floor = isoDaysBefore(today, maxLookback);
  const newestInWindow = [...dateSet]
    .filter((d) => d <= today && d >= floor)
    .sort()
    .pop();
  if (newestInWindow) {
    return { displayDayKey: newestInWindow, requestedDayKey: today, isFallback: true };
  }

  return { displayDayKey: today, requestedDayKey: today, isFallback: false };
}

export function scopeRecapDayToDisplayDay(day: Record<string, unknown>) {
  const filings = Array.isArray(day.filings) ? (day.filings as Record<string, unknown>[]) : [];
  const dates = filings.map((f) => String(f.filingDate ?? ""));
  const { displayDayKey, requestedDayKey, isFallback } = resolveExploreDisplayDay(dates, {
    today: todayUtcIso(),
    maxLookback: 7,
  });
  const scopedFilings = filings.filter(
    (f) => String(f?.filingDate ?? "").slice(0, 10) === displayDayKey,
  );
  return {
    ...day,
    dayKey: displayDayKey,
    requestedDayKey,
    isFallback,
    filings: scopedFilings,
  };
}
