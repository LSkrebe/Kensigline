/** Insider CASE worksheet row helpers (Form 4 cluster aggregation + parse). */

export function isBogusInsiderWorksheetKey(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k || k === "Insider" || k === "—") return true;
  if (/^P-?\d+$/i.test(k)) return true;
  if (/^purchase\s+\d+$/i.test(k)) return true;
  return false;
}

export function ownerSurname(name: string | null | undefined): string | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/).filter(Boolean);
  const last = parts.at(-1) ?? "";
  const cleaned = last.replace(/[^A-Za-z]/g, "");
  return cleaned || null;
}

export type InsiderWorksheetRow = {
  key: string;
  insider_name?: string | null;
  surname?: string | null;
  role?: string | null;
  transaction_code?: string | null;
  acquired_disposed?: string | null;
  amount_usd?: number | null;
  shares?: number | null;
  is_derivative?: boolean;
  ts?: string | null;
};

/** Preserve all CASE fields when merging ticker-level clusters. */
export function normalizeInsiderWorksheetRow(raw: unknown): InsiderWorksheetRow {
  const r = raw as Record<string, unknown>;
  const key = String(r?.key ?? "").trim() || "Insider";
  const insider_name = r?.insider_name != null ? String(r.insider_name).trim() : null;
  const surname =
    r?.surname != null
      ? String(r.surname).trim()
      : insider_name
        ? ownerSurname(insider_name)
        : null;
  const role = r?.role != null ? String(r.role).trim() : null;
  return {
    key,
    insider_name,
    surname,
    role,
    transaction_code:
      r?.transaction_code != null
        ? String(r.transaction_code)
        : r?.code != null
          ? String(r.code)
          : "P",
    acquired_disposed: r?.acquired_disposed != null ? String(r.acquired_disposed) : "A",
    amount_usd: r?.amount_usd != null ? Number(r.amount_usd) : null,
    shares: r?.shares != null ? Number(r.shares) : null,
    is_derivative: Boolean(r?.is_derivative ?? r?.derivative),
    ts: r?.ts != null ? String(r.ts) : null,
  };
}
