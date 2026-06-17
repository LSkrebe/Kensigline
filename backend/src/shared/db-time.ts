/** Normalize pg `timestamptz` values (Date or ISO text) for API + comparisons. */
export function isoDayFromDbTimestamp(raw: string | Date | null | undefined): string | null {
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

export function isoTimestampFromDb(raw: string | Date | null | undefined): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) return null;
    return raw.toISOString();
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.includes("T") ? s : `${s.slice(0, 10)}T00:00:00.000Z`;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return null;
}
