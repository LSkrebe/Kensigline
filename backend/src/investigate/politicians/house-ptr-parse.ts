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
  if (t === "p" || t.includes("purchase") || t.includes("buy")) return "P";
  if (t === "s" || t.includes("sale") || t.includes("sell")) return "S";
  if (t === "e" || t.includes("exchange")) return "E";
  return null;
}

function parseTickerFromLine(line: string): string | null {
  const paren = line.match(/\(([A-Z]{1,6}(?:\.[A-Z])?)\)/)?.[1];
  if (paren) return paren.toUpperCase();
  const dash = line.match(/--\s*([A-Z]{1,6})\s*--/)?.[1];
  if (dash) return dash.toUpperCase();
  // Only accept explicit symbol markers (avoid grabbing random ALL-CAPS words from asset descriptions).
  const tagged = line.match(/\b(?:ticker|symbol)\s*[:#-]\s*([A-Z]{1,6}(?:\.[A-Z])?)\b/i)?.[1];
  if (tagged) return tagged.toUpperCase();
  return null;
}

function parseAmountRange(line: string): string | null {
  const m = line.match(/\$[\d,]+(?:\.\d{2})?\s*-\s*\$[\d,]+(?:\.\d{2})?/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function parseFilerName(text: string): string | null {
  const m =
    text.match(/(?:^|\n)\s*Name:\s*(.+)/im) ??
    text.match(/(?:^|\n)\s*Filer:\s*(.+)/im) ??
    text.match(/(?:^|\n)\s*Member:\s*(.+)/im);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

function parseFiledAt(text: string): string | null {
  const m =
    text.match(/(?:Date\s+of\s+Notification|Notification\s+Date|Filed)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    text.match(/(?:^|\n)\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/im);
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
      ? `The report was filed on ${filedAt} via the House Clerk disclosure system.`
      : "The report was filed via the U.S. House financial disclosure system.",
  ];
}

/** Parse House PTR PDF text; returns confident_rows for LLM fallback gating. */
export function parseHousePtrPdfText(pdfText: string, pdfUrl: string): ParsedHousePtr {
  const text = String(pdfText ?? "");
  const filing_id = (pdfUrl.match(/\/(\d+)\.pdf$/i) ?? [])[1] ?? null;
  const filerName = parseFilerName(text);
  const filed_at = parseFiledAt(text);
  const transactions: HousePtrTransaction[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 12) continue;

    const amount_range = parseAmountRange(line);
    if (!amount_range) continue;

    const dates = [...line.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})/g)].map((d) => d[1] ?? "");
    const transaction_date = parseUsDateToIso(dates[0] ?? null);
    const notification_date = parseUsDateToIso(dates[1] ?? null) ?? filed_at;

    const ticker = parseTickerFromLine(line);
    const typeLetter = line.match(/\b([PSE])\b/)?.[1] ?? null;
    const transaction_type = mapTxnType(typeLetter) ?? mapTxnType(line);

    const asset_name =
      line
        .replace(amount_range, "")
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "")
        .replace(/\b[SP]\b/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || null;

    const key = `${transaction_date ?? ""}|${ticker ?? ""}|${transaction_type ?? ""}|${amount_range}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!transaction_type && !ticker) continue;

    transactions.push({
      owner: null,
      asset_name,
      ticker,
      asset_type: /\bST\b/i.test(line) || /stock/i.test(line) ? "ST" : null,
      transaction_type,
      transaction_date,
      notification_date,
      amount_range,
      description: transaction_type ? `${transaction_type === "P" ? "Purchase" : transaction_type === "S" ? "Sale" : "Exchange"}` : null,
    });
  }

  const confident_rows = transactions.filter((t) => t.ticker && t.transaction_type && t.amount_range).length;
  const purchases = transactions.filter((t) => t.transaction_type === "P" && t.ticker);

  return {
    filer: {
      name: filerName,
      office: "Representative",
      state_district: null,
    },
    filing_id,
    filed_at,
    transactions,
    context_sentences: buildContextSentences(filerName, filed_at, purchases),
    confident_rows,
  };
}

export const MIN_HOUSE_PTR_CONFIDENT_ROWS = 1;
