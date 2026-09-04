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
};

const AMOUNT_RANGE_RE = /\$[\d,]+(?:\.\d{2})?\s*-\s*\$?[\d,]+(?:\.\d{2})?/g;

function parseUsDateToIso(s: string | null): string | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function mapTxnType(label: string | null): string | null {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "p" || t.startsWith("p ") || t.includes("purchase") || t.includes("buy")) return "P";
  if (t === "s" || t.startsWith("s ") || t.includes("sale") || t.includes("sell")) return "S";
  if (t === "e" || t.includes("exchange")) return "E";
  return null;
}

function parseTickerFromText(text: string): string | null {
  const paren = text.match(/\(([A-Z]{1,6}(?:\.[A-Z])?)\)/)?.[1];
  if (paren) return paren.toUpperCase();
  const dash = text.match(/--\s*([A-Z]{1,6})\s*--/)?.[1];
  if (dash) return dash.toUpperCase();
  const tagged = text.match(/\b(?:ticker|symbol)\s*[:#-]\s*([A-Z]{1,6}(?:\.[A-Z])?)\b/i)?.[1];
  if (tagged) return tagged.toUpperCase();
  return null;
}

function normalizeAmountRange(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\$\s+/g, "$")
    .replace(/\s*-\s*\$?\s*/g, " - $")
    .replace(/\$\s*\$/g, "$")
    .trim();
}

function parseAmountRange(text: string): string | null {
  const m = text.match(/\$[\d,]+(?:\.\d{2})?\s*-\s*\$?[\d,]+(?:\.\d{2})?/);
  return m ? normalizeAmountRange(m[0]) : null;
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
    cleaned.match(/(?:Date\s+of\s+Notification|Notification\s+Date|Filed)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    cleaned.match(/\bDate:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? parseUsDateToIso(m[1] ?? null) : null;
}

function parseAssetType(text: string): string | null {
  const m = text.match(/\[([A-Z]{2,4})\]/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function parseTxnTypeFromWindow(window: string): string | null {
  const typed =
    window.match(/\b([PSE])\s*(?:\(\s*partial\s*\))?\s+\d{1,2}\/\d{1,2}\/\d{4}/i) ??
    window.match(/\b([PSE])\s+\d{1,2}\/\d{1,2}\/\d{4}/);
  if (typed?.[1]) return mapTxnType(typed[1]);
  if (/\bpurchase\b/i.test(window)) return "P";
  if (/\bsale\b/i.test(window) || /\bsold\b/i.test(window)) return "S";
  if (/\bexchange\b/i.test(window)) return "E";
  return null;
}

function parseTransactionWindow(window: string, filed_at: string | null): HousePtrTransaction | null {
  const amount_range = parseAmountRange(window);
  if (!amount_range) return null;

  const dates = [...window.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})/g)].map((d) => d[1] ?? "");
  const transaction_date = parseUsDateToIso(dates[0] ?? null);
  const notification_date = parseUsDateToIso(dates[1] ?? null) ?? filed_at;

  const ticker = parseTickerFromText(window);
  const transaction_type = parseTxnTypeFromWindow(window);
  const asset_type = parseAssetType(window);

  if (!transaction_type && !ticker) return null;

  const asset_name =
    window
      .replace(amount_range, "")
      .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "")
      .replace(/\b[SP]\b/g, "")
      .replace(/\[[A-Z]{2,4}\]/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || null;

  return {
    owner: null,
    asset_name,
    ticker,
    asset_type: asset_type ?? (/\bstock\b/i.test(window) ? "ST" : null),
    transaction_type,
    transaction_date,
    notification_date,
    amount_range,
    description: transaction_type
      ? transaction_type === "P"
        ? "Purchase"
        : transaction_type === "S"
          ? "Sale"
          : "Exchange"
      : null,
  };
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
      ? `The report was filed on ${filedAt} via the House Clerk disclosure system.`
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
  const seen = new Set<string>();

  for (const m of flat.matchAll(AMOUNT_RANGE_RE)) {
    const idx = m.index ?? 0;
    const window = flat.slice(Math.max(0, idx - 380), Math.min(flat.length, idx + m[0].length + 100));
    const row = parseTransactionWindow(window, filed_at);
    if (!row) continue;

    const key = `${row.transaction_date ?? ""}|${row.ticker ?? ""}|${row.transaction_type ?? ""}|${row.amount_range}`;
    if (seen.has(key)) continue;
    seen.add(key);
    transactions.push(row);
  }

  // Fallback: line-based pass for PDFs that still have readable newlines.
  if (!transactions.length) {
    for (const rawLine of normalizePtrPdfText(pdfText).split(/\n/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      if (line.length < 12) continue;
      const row = parseTransactionWindow(line, filed_at);
      if (!row) continue;
      const key = `${row.transaction_date ?? ""}|${row.ticker ?? ""}|${row.transaction_type ?? ""}|${row.amount_range}`;
      if (seen.has(key)) continue;
      seen.add(key);
      transactions.push(row);
    }
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
  };
}

export const MIN_HOUSE_PTR_CONFIDENT_ROWS = 1;
