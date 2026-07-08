export function clampInt(n: unknown, min: number, max: number, fallback: number) {
  if (n === null || n === undefined || n === "") return fallback;
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export function isLocalCalendarToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function politicianWorksheetRowHasTxn(r: Record<string, unknown>): boolean {
  const range = String(r?.amountRange ?? r?.amount_range ?? "").trim();
  if (range) return true;
  const amt = Number(r?.amount_usd ?? r?.amountUsd ?? 0);
  return Number.isFinite(amt) && amt > 0;
}

export function parseEventTimeMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

export function latestEventAtFromDoc(rows: unknown, docFeedAt: string): string {
  const now = Date.now();
  const graceMs = 14 * 24 * 60 * 60 * 1000;
  const filedMs = parseEventTimeMs(docFeedAt);
  let best = docFeedAt;
  let bestT = filedMs;
  if (Array.isArray(rows)) {
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const ts = String(r?.ts ?? "").trim();
      const t = parseEventTimeMs(ts || docFeedAt);
      if (t > bestT) {
        bestT = t;
        best = ts || docFeedAt;
      }
    }
  }
  if (bestT > now + graceMs && filedMs > Number.NEGATIVE_INFINITY) {
    return docFeedAt;
  }
  return best;
}

export type WorksheetCountKind = "insider" | "politicians" | "institutions";

export function countWorksheetEventsToday(rows: unknown, docFeedAt: string, kind: WorksheetCountKind): number {
  if (!Array.isArray(rows) || rows.length === 0) {
    return isLocalCalendarToday(docFeedAt) ? 1 : 0;
  }
  let n = 0;
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const ts = String(r?.ts ?? "").trim();
    const when = ts || docFeedAt;
    if (!isLocalCalendarToday(when)) continue;
    if (kind === "politicians" && !politicianWorksheetRowHasTxn(r)) continue;
    n += 1;
  }
  return n;
}

export function isCompanyClusterId(id: string) {
  return id.startsWith("company:");
}

export function tickerFromCompanyClusterId(id: string) {
  return id.slice("company:".length).trim().toUpperCase();
}

export function tickerFromClusterId(id: string) {
  return id.startsWith("ticker:") ? id.slice("ticker:".length).trim().toUpperCase() : "";
}
