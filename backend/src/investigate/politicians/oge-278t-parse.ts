export type Oge278tTransaction = {
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

export type ParsedOge278t = {
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing_id: string | null;
  filed_at: string | null;
  transactions: Oge278tTransaction[];
  context_sentences: string[];
  confident_rows: number;
};

/** Minimum confident P/S/E rows before we accept a deterministic parse. */
export const MIN_OGE_278T_CONFIDENT_ROWS = 1;

function parseUsDateToIso(s: string | null): string | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10)===iso ? iso : null;
}

function mapTxnType(label: string | null): string | null {
  const t = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t) return null;
  if (t === "p" || t.includes("purchase") || t.includes("buy")) return "P";
  if (t === "s" || t.includes("sale") || t.includes("sell")) return "S";
  if (t === "e" || t.includes("exchange")) return "E";
  return null;
}

function parseTickerFromAsset(asset: string): string | null {
  const paren = asset.match(/\(([A-Z]{1,6}(?:\.[A-Z])?)\)\s*$/);
  if (paren?.[1]) return paren[1].toUpperCase();
  const any = asset.match(/\(([A-Z]{1,6}(?:\.[A-Z])?)\)/);
  if (any?.[1]) return any[1].toUpperCase();
  return null;
}

function normalizeOgeName(raw: string | null): string | null {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // "Last, First M" → "First M Last"
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) {
    const last = m[1]!.trim();
    const first = m[2]!.trim();
    if (last && first) return `${first} ${last}`.slice(0, 120);
  }
  return s.slice(0, 120);
}

function parseFilerFromText(text: string): { name: string | null; office: string | null } {
  const paper=text.match(/Filer[’']?s\s+Name\s+(?:Pa[^\n]*\n)?([^\n]+?)(?:\s+Page\s+\d|\n)/i);
  if(paper?.[1] && !/description|transaction|amount/i.test(paper[1]))return {name:normalizeOgeName(paper[1]),office:null};
  // Electronic Integrity.gov forms: "Filer's Information Last, First Title, Agency"
  const info = text.match(
    /Filer's\s+Information\s+([^\n]+?)(?:\s+Electronic\s+Signature|\s+Agency\s+Ethics|\s+Transactions\b)/i,
  );
  if (info?.[1]) {
    const block = info[1].replace(/\s+/g, " ").trim();
    // Prefer "Last, First …" then leftover as office/title
    const nameMatch = block.match(/^([A-Za-z][^,]{0,60},\s*[A-Za-z][^,]{0,80}?)(?:\s+(.+))?$/);
    if (nameMatch) {
      return {
        name: normalizeOgeName(nameMatch[1] ?? null),
        office: nameMatch[2] ? nameMatch[2].replace(/\s+/g, " ").trim().slice(0, 160) : null,
      };
    }
  }

  const header = text.match(/^([A-Za-z][^,\n]{0,60},\s*[A-Za-z][^\n-]{0,80}?)\s*-\s*Page\s+\d+/im);
  if (header?.[1]) {
    return { name: normalizeOgeName(header[1]), office: null };
  }

  const signed = text.match(/electronically signed on\s+\d{2}\/\d{2}\/\d{4}\s+by\s+([^\]\n]+)/i);
  if (signed?.[1]) {
    return { name: normalizeOgeName(signed[1].trim()), office: null };
  }

  return { name: null, office: null };
}

function parseFiledAt(text: string, pdfUrl: string): string | null {
  const signed = text.match(/electronically signed on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (signed?.[1]) return parseUsDateToIso(signed[1]);

  const ogeRecv = text.match(/OGE\s+Received:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (ogeRecv?.[1]) return parseUsDateToIso(ogeRecv[1]);

  // Filename often embeds MM.DD.YYYY before 278T
  const fromUrl = decodeURIComponent(pdfUrl).match(/(\d{2})\.(\d{2})\.(\d{4}).*278T/i);
  if (fromUrl) {
    return parseUsDateToIso(`${fromUrl[1]}/${fromUrl[2]}/${fromUrl[3]}`);
  }
  return null;
}

function filingIdFromUrl(pdfUrl: string): string | null {
  const m = String(pdfUrl).match(/PAS\+Index\/([A-F0-9]+)\//i);
  return m?.[1] ?? null;
}

function buildContextSentences(
  filerName: string | null,
  filedAt: string | null,
  purchases: Oge278tTransaction[],
): string[] {
  if (!purchases.length || !filerName) return [];
  const tickers = [...new Set(purchases.map((t) => t.ticker).filter(Boolean))];
  return [
    `${filerName} filed an OGE Form 278-T with ${purchases.length} stock purchase row${purchases.length === 1 ? "" : "s"}.`,
    tickers.length
      ? `Disclosed tickers include ${tickers.slice(0, 6).join(", ")}${tickers.length > 6 ? ", and others" : ""}.`
      : "The filing lists purchase activity in reportable securities.",
    filedAt
      ? `The report was certified on ${filedAt} via the U.S. Office of Government Ethics.`
      : "The report was filed via the U.S. Office of Government Ethics.",
  ];
}

function normalizePdfText(pdfText: string): string {
  return String(pdfText ?? "")
    .replace(/\u00a0/g, " ").replace(/[|]/g," ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n");
}

/**
 * Deterministic OGE Form 278-T parse from PDF text.
 * Works best on Integrity.gov electronic filings; scanned OCR may return low confidence.
 */
export function parseOge278tPdfText(pdfText: string, pdfUrl: string): ParsedOge278t {
  const text = normalizePdfText(pdfText);
  const { name: filerName, office } = parseFilerFromText(text);
  const filed_at = parseFiledAt(text, pdfUrl);
  const filing_id = filingIdFromUrl(pdfUrl);
  const transactions: Oge278tTransaction[] = [];


  // Headers are inconsistently recognised on scans; never discard earlier pages because
  // a later page happens to contain the first legible DESCRIPTION header.
  let tableText = text;
  // Flattened headers often put "OVER 30 DAYS AGO" before row 1 — strip so "30" is not a row index.
  tableText = tableText.replace(/\bNOTIFICATION\s+RECEIVED\s+OVER\s+\d{1,3}\s+DAYS\s+AGO\b/gi, " ");
  tableText = tableText.replace(/#\s*DESCRIPTION\s+TYPE\s+DATE\b/gi, " ");

  // Electronic table rows (Integrity.gov):
  // 1   Corning, Inc. (GLW)   Purchase   05/13/2026   No   $50,001 - $100,000
  // Word boundaries on type labels — /Purchase/i would otherwise hit "purchases" in boilerplate.
  const rowRe =
    /\b(\d{1,5})\s+([^\n\f]{3,200}?)\s+[\[\]_:]*\b(Purchase|Sale|Exchange)\b\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\b(Yes|No)\b\s*(\$[\d,]+(?:\.\d{2})?\s*-\s*\$[\d,]+(?:\.\d{2})?)/gi;

  for (const m of tableText.matchAll(rowRe)) {
    const asset_name = String(m[2] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (
      !asset_name ||
      /endnotes|privacy act|summary of contents|filer's information|days ago|\bamount\b/i.test(asset_name)
    ) {
      continue;
    }
    const transaction_type = mapTxnType(m[3] ?? null);
    const transaction_date = parseUsDateToIso(m[4] ?? null);
    const amount_range = String(m[6] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const bounds=amount_range.replace(/[$,\s]/g,'').split('-').map(Number);
    const validRanges=new Set(['1001:15000','15001:50000','50001:100000','100001:250000','250001:500000','500001:1000000','1000001:5000000','5000001:25000000','25000001:50000000']);
    if(!validRanges.has(bounds.join(':')))continue;
    const ticker = parseTickerFromAsset(asset_name);

    const isOption = /\b(option|warrant|call|put)\b/i.test(asset_name);
    const isNonStock = /bond|note|treasury|municipal|debenture|fund|ETF/i.test(asset_name);
    let asset_type: string | null = null;
    if (isOption) asset_type = "OP";
    else if (!isNonStock && (ticker || /stock/i.test(asset_name))) asset_type = "ST";

    if (!transaction_type || !transaction_date) continue;

    transactions.push({
      owner: null,
      asset_name: asset_name || null,
      ticker,
      asset_type,
      transaction_type,
      transaction_date,
      notification_date: filed_at,
      amount_range,
      description:
        transaction_type === "P" ? "Purchase" : transaction_type === "S" ? "Sale" : "Exchange",
    });
  }

  const confident_rows = transactions.filter((t) => t.ticker && t.transaction_type && t.amount_range).length;
  const purchases = transactions.filter((t) => t.transaction_type === "P" && t.ticker);

  return {
    filer: {
      name: filerName,
      office: office || "Executive",
      state_district: null,
    },
    filing_id,
    filed_at,
    transactions,
    context_sentences: buildContextSentences(filerName, filed_at, purchases),
    confident_rows,
  };
}
