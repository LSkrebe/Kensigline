export type InstitutionTxnRow = {
  filerId: string;
  instrumentType?: string | null;
  dataQualityVersion?: number;
  activity?: string | null;
  amountUsd?: number | null;
  shares?: number | null;
  transactionAt: string;
};

/** One 13F filing row = one ticker stake snapshot; never multiple tx rows. */
export function consolidateInstitutionTxnRows(rows: InstitutionTxnRow[]): InstitutionTxnRow[] {
  if (rows.length <= 1) return rows;
  const first = rows[0]!;
  const shares = rows.reduce((a, r) => a + (Number(r.shares) || 0), 0);
  const amountUsd = rows.reduce((a, r) => a + (Number(r.amountUsd) || 0), 0);
  return [
    {
      filerId: first.filerId,
      instrumentType: new Set(rows.map(r=>r.instrumentType)).size === 1 ? first.instrumentType ?? null : "mixed",
      dataQualityVersion: Math.min(...rows.map(r=>r.dataQualityVersion ?? 0)),
      activity: first.activity ?? null,
      amountUsd: amountUsd > 0 ? amountUsd : first.amountUsd ?? null,
      shares: shares > 0 ? shares : first.shares ?? null,
      transactionAt: first.transactionAt,
    },
  ];
}
