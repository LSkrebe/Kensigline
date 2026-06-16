export type Parsed13fHolding = {
  issuer_name: string;
  cusip: string | null;
  title_of_class: string | null;
  value_usd: number | null;
  shares: number | null;
};

export type Parsed13fMeta = {
  filer_name: string | null;
  cik: string | null;
  accession_no: string | null;
  filed_at: string | null;
  period_of_report: string | null;
};

function stripXml(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlTag(block: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i");
  const m = block.match(re);
  if (!m?.[1]) return null;
  const v = stripXml(m[1]);
  return v || null;
}

function parseNumber(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseXmlInfoTables(text: string): Parsed13fHolding[] {
  const holdings: Parsed13fHolding[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(/<(?:\w+:)?infoTable[^>]*>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    const block = m[1] ?? "";
    const issuer_name = extractXmlTag(block, "nameOfIssuer");
    if (!issuer_name) continue;

    const cusip = extractXmlTag(block, "cusip");
    const title_of_class = extractXmlTag(block, "titleOfClass");
    const valueThousands = parseNumber(extractXmlTag(block, "value"));
    const shares = parseNumber(extractXmlTag(block, "sshPrnamt"));
    const value_usd = valueThousands != null ? valueThousands * 1000 : null;

    const key = `${issuer_name}|${cusip ?? ""}|${value_usd ?? ""}|${shares ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    holdings.push({ issuer_name, cusip, title_of_class, value_usd, shares });
  }

  return holdings;
}

function parseHtmlOrTextTableRows(text: string): Parsed13fHolding[] {
  const holdings: Parsed13fHolding[] = [];
  const seen = new Set<string>();
  const plain = String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rowRe =
    /([A-Z][A-Za-z0-9 .,&'()/\-]{2,80}?)\s+(?:COM|CL [A-Z]|COMMON|ORD|SHS)?\s*([A-Z0-9]{6,9})\s+([\d,]+)\s+([\d,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(plain)) != null) {
    const issuer_name = String(m[1] ?? "").trim();
    const cusip = String(m[2] ?? "").trim().toUpperCase();
    const valueThousands = parseNumber(m[3] ?? null);
    const shares = parseNumber(m[4] ?? null);
    if (!issuer_name || issuer_name.length < 3) continue;

    const key = `${issuer_name}|${cusip}|${valueThousands ?? ""}|${shares ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    holdings.push({
      issuer_name,
      cusip,
      title_of_class: null,
      value_usd: valueThousands != null ? valueThousands * 1000 : null,
      shares,
    });
  }

  return holdings;
}

function parseIsoFromUsDate(s: string | null): string | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function parse13fMeta(text: string, indexUrl?: string): Parsed13fMeta {
  const t = String(text ?? "");
  const filer_name =
    extractXmlTag(t, "reportingManagerName") ??
    t.match(/reporting\s+manager[:\s]+([^\n<]{3,120})/i)?.[1]?.trim() ??
    t.match(/<(?:\w+:)?name>([^<]{3,120})<\/(?:\w+:)?name>/i)?.[1]?.trim() ??
    null;

  const cikRaw =
    extractXmlTag(t, "cik") ??
    t.match(/\bCIK[:\s]*(\d{10}|\d{1,10})\b/i)?.[1] ??
    indexUrl?.match(/\/data\/(\d+)\//)?.[1] ??
    null;
  const cik = cikRaw ? String(cikRaw).replace(/\D/g, "").padStart(10, "0") : null;

  const accession_no =
    extractXmlTag(t, "accessionNumber") ??
    t.match(/\b(\d{10}-\d{2}-\d{6})\b/)?.[1] ??
    indexUrl?.match(/\/(\d{10}-\d{2}-\d{6})\//)?.[1] ??
    null;

  const filed_at =
    parseIsoFromUsDate(extractXmlTag(t, "filingDate")) ??
    parseIsoFromUsDate(t.match(/filed\s+as\s+of[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? null) ??
    null;

  const period_of_report =
    parseIsoFromUsDate(extractXmlTag(t, "periodOfReport")) ??
    parseIsoFromUsDate(t.match(/report\s+for\s+the\s+calendar\s+year[^\d]*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? null) ??
    null;

  return { filer_name, cik, accession_no, filed_at, period_of_report };
}

/** Parse 13F information-table rows from XML and plain/HTML text. */
export function parse13fHoldings(text: string): Parsed13fHolding[] {
  const xml = parseXmlInfoTables(text);
  if (xml.length >= 3) return xml;

  const rows = parseHtmlOrTextTableRows(text);
  if (rows.length > xml.length) return rows;
  return xml.length ? xml : rows;
}

export const MIN_PARSED_13F_HOLDINGS = 3;
