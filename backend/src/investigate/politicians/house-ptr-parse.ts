export type HousePtrTransaction = {
  owner: string | null;
  asset_name: string | null;
  ticker: string | null;
  asset_type: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  notification_date: string | null;
  amount_range: string | null;
  description: string | null;
};

export type ParsedHousePtr = {
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing_id: string | null;
  filed_at: string | null;
  transactions: HousePtrTransaction[];
  context_sentences: string[];
  confident_rows: number;
  is_amendment?: boolean;
};

function parseUsDateToIso(s: string | null): string | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10)===iso ? iso : null;
}

function normalizeAmountRange(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\$\s+/g, "$")
    .replace(/\s*-\s*\$?\s*/g, " - $")
    .replace(/\$\s*\$/g, "$")
    .trim();
}

export function normalizePtrPdfText(text: string): string {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function flatPtrText(text: string): string {
  return normalizePtrPdfText(text).replace(/\s+/g, " ");
}

function parseFilerName(text: string): string | null {
  const cleaned = flatPtrText(text);
  const patterns = [
    /\bName:\s*(.+?)(?:\s+Status:|\s+State\/District:|$)/i,
    /\bDigitally Signed:\s*(.+?)(?:\s*,|$)/i,
    /\bFiler:\s*(.+?)(?:\s+Status:|$)/i,
    /\bMember:\s*(.+?)(?:\s+Status:|$)/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (!m?.[1]) continue;
    const name = m[1].replace(/\s+/g, " ").trim().slice(0, 120);
    if (name && !/^(politician|unknown|filer|member)$/i.test(name)) return name;
  }
  return null;
}

function parseStateDistrict(text: string): string | null {
  const m = flatPtrText(text).match(/\bState\/District:\s*([A-Z]{2}\d{0,2})/i);
  return m?.[1]?.trim().toUpperCase() ?? null;
}

function parseFiledAt(text: string): string | null {
  const cleaned = flatPtrText(text);
  const m =
    cleaned.match(/Digitally Signed:.{1,200}?,\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    cleaned.match(/\bFiled(?:\s+on)?[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? parseUsDateToIso(m[1] ?? null) : null;
}

function buildContextSentences(
  filerName: string | null,
  filedAt: string | null,
  purchases: HousePtrTransaction[],
): string[] {
  if (!purchases.length || !filerName) return [];
  const tickers = [...new Set(purchases.map((t) => t.ticker).filter(Boolean))];
  return [
    `${filerName} filed a House periodic transaction report with ${purchases.length} stock purchase row${purchases.length === 1 ? "" : "s"}.`,
    tickers.length
      ? `Disclosed tickers include ${tickers.slice(0, 6).join(", ")}${tickers.length > 6 ? ", and others" : ""}.`
      : "The filing lists purchase activity in reportable securities.",
    filedAt
      ? `The report was signed on ${filedAt} via the House Clerk disclosure system.`
      : "The report was filed via the U.S. House financial disclosure system.",
  ];
}

/** Parse House PTR PDF text; returns confident_rows for LLM fallback gating. */
export function parseHousePtrPdfText(pdfText: string, pdfUrl: string): ParsedHousePtr {
  const flat = flatPtrText(pdfText);
  const filing_id = (pdfUrl.match(/\/(\d+)\.pdf$/i) ?? [])[1] ?? null;
  const filerName = parseFilerName(flat);
  const filed_at = parseFiledAt(flat);
  const transactions: HousePtrTransaction[] = [];


  // Anchor each row to its asset-type, action, two dates and amount range.
  // Overlapping character windows can silently attach the previous row's ticker/date.
  const rowPattern = /\[([A-Z]{2,4})\]\s+([PSE])\s*(?:\(\s*partial\s*\))?\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\$[\d,]+(?:\.\d{2})?\s*-\s*\$?[\d,]+(?:\.\d{2})?)/g;
  let previousEnd = 0;
  for (const match of flat.matchAll(rowPattern)) {
    const start = match.index ?? 0;
    const prefix = flat.slice(previousEnd, start).split('$200?').at(-1) ?? '';
    const ownerMatches = [...prefix.matchAll(/\b(SP|JT|DC|SELF)\s+/g)];
    const owner = ownerMatches.at(-1);
    const asset = (owner ? prefix.slice(owner.index! + owner[0].length) : prefix.split('$200?').at(-1) ?? prefix).trim();
    const ticker = asset.match(/\(([A-Z]{1,6}(?:\.[A-Z])?)\)\s*$/)?.[1] ?? null;
    const end = start + match[0].length;
    const tail = flat.slice(end);
    const description = tail.match(/^(?:\s*F\s*S:\s*\w+)?\s*D:\s*(.*?)(?=\s+(?:SP|JT|DC|SELF)\s|\s+Filing ID|\s+\* For|$)/)?.[1]?.trim() ?? null;
    const assetType = match[1]!;
    const row: HousePtrTransaction = {
      owner: owner?.[1] ?? null,
      asset_name: `${asset.slice(-200)} [${assetType}]`,
      ticker,
      asset_type: assetType,
      transaction_type: match[2]!,
      transaction_date: parseUsDateToIso(match[3]!),
      notification_date: parseUsDateToIso(match[4]!),
      amount_range: normalizeAmountRange(match[5]!),
      description,
    };
    previousEnd = end;
    if(row.transaction_date && row.notification_date)transactions.push(row);
  }

  const confident_rows = transactions.filter((t) => t.ticker && t.transaction_type && t.amount_range).length;
  const purchases = transactions.filter((t) => t.transaction_type === "P" && t.ticker);

  return {
    filer: {
      name: filerName,
      office: "Representative",
      state_district: parseStateDistrict(flat),
    },
    filing_id,
    filed_at,
    transactions,
    context_sentences: buildContextSentences(filerName, filed_at, purchases),
    confident_rows,
    is_amendment: /\b(amendment|amended)\b/i.test(pdfText),
  };
}

export const MIN_HOUSE_PTR_CONFIDENT_ROWS = 1;
