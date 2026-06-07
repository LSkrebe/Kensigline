/** Form 4 transaction code → signed USD multiplier (0 = skip). */
export function insiderTxnSign(code: string | null | undefined): number {
  const c = String(code ?? "")
    .trim()
    .toUpperCase();
  if (c === "S" || c === "D") return -1;
  if (c === "P" || c === "A" || c === "M" || c === "G" || c === "W") return 1;
  return 0;
}

/** PTR / disclosure transaction type → signed USD multiplier. */
export function politicianTxnSign(type: string | null | undefined): number {
  const t = String(type ?? "")
    .trim()
    .toUpperCase();
  if (t === "S" || t.startsWith("SALE") || t.includes("SELL")) return -1;
  if (t === "P" || t.startsWith("PURCHASE") || t.includes("BUY")) return 1;
  return 0;
}

/** 13F activity label → signed USD multiplier (0 = neutral / skip). */
export function institutionActivitySign(activity: string | null | undefined): number {
  const a = String(activity ?? "")
    .trim()
    .toLowerCase();
  if (/reduc|decreas|sold|exit|closed|trimmed/.test(a)) return -1;
  if (/increas|new|added|initiated|opened|raised/.test(a)) return 1;
  return 0;
}
