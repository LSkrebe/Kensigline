/** Deterministic Form 3/4/5 XML parsing — preserves every transaction code in the filing. */

export type FormXmlTransaction = {
  transaction_code: string;
  transaction_date: string | null;
  shares: number | null;
  price: number | null;
  amount_usd: number | null;
  security_title: string | null;
  acquired_disposed: string | null;
  is_derivative: boolean;
  shares_after?: number | null;
  ownership?: string | null;
  ownership_nature?: string | null;
  footnote_ids?: string[];
};

export type FormXmlOwner = {
  name: string | null;
  role: string;
};

export function firstXmlTagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?)${tag}\\b[^>]*>([\\s\\S]*?)<\\/\\1${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  const inner = String(m[2] ?? "");
  const mv = inner.match(/<((?:[A-Za-z_][\w.-]*:)?)value\b[^>]*>([\s\S]*?)<\/\1value>/i);
  const picked = mv ? String(mv[2] ?? "") : inner;
  const text = picked.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function parseNumberLoose(s: string | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[, ]+/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTransactionBlock(block: string, isDerivative: boolean): FormXmlTransaction | null {
  const code = String(firstXmlTagText(block, "transactionCode") ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  if (!code) return null;

  const dt = firstXmlTagText(block, "transactionDate");
  const shares = parseNumberLoose(firstXmlTagText(block, "transactionShares"));
  const price = parseNumberLoose(firstXmlTagText(block, "transactionPricePerShare"));
  const title = firstXmlTagText(block, "securityTitle");
  const ad = String(firstXmlTagText(block, "transactionAcquiredDisposedCode") ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  const amount_usd = shares != null && price != null ? Math.round(shares * price * 100) / 100 : null;

  return {
    transaction_code: code,
    transaction_date: dt,
    shares,
    price,
    amount_usd,
    security_title: title,
    acquired_disposed: ad || null,
    is_derivative: isDerivative,
    shares_after: parseNumberLoose(firstXmlTagText(block, "sharesOwnedFollowingTransaction")),
    ownership: firstXmlTagText(block, "directOrIndirectOwnership"),
    ownership_nature: firstXmlTagText(block, "natureOfOwnership"),
    footnote_ids: [...block.matchAll(/<footnoteId\b[^>]*id=["']([^"']+)["']/gi)].map(m => m[1]!),
  };
}

export function extractAllFormTransactions(xml: string): FormXmlTransaction[] {
  const out: FormXmlTransaction[] = [];
  const nonDeriv =
    xml.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction>/gi,
    ) ?? [];
  for (const b of nonDeriv) {
    const row = parseTransactionBlock(b, false);
    if (row) out.push(row);
  }
  const deriv =
    xml.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?derivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?derivativeTransaction>/gi,
    ) ?? [];
  for (const b of deriv) {
    const row = parseTransactionBlock(b, true);
    if (row) out.push(row);
  }
  return out;
}

export function extractFormReportingOwners(xml: string): FormXmlOwner[] {
  const blocks =
    xml.match(/<(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner>/gi) ??
    [];
  if (!blocks.length) return [extractFormReportingOwner(xml)];
  return blocks.map((b) => extractFormReportingOwner(b));
}

export function extractFormReportingOwner(xml: string): FormXmlOwner {
  const name = firstXmlTagText(xml, "rptOwnerName");
  const title = firstXmlTagText(xml, "officerTitle");
  const isDirector = String(firstXmlTagText(xml, "isDirector") ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const isOfficer = String(firstXmlTagText(xml, "isOfficer") ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();

  let role = "OFF";
  if (title) {
    if (/CEO|CHIEF\s*EXECUTIVE/i.test(title)) role = "CEO";
    else if (/CFO|CHIEF\s*FINANCIAL/i.test(title)) role = "CFO";
    else if (/COO|CHIEF\s*OPERATING/i.test(title)) role = "COO";
    else if (/CTO|CHIEF\s*TECH/i.test(title)) role = "CTO";
    else if (/CMO|CHIEF\s*MEDICAL/i.test(title)) role = "CMO";
    else if (/DIRECTOR/i.test(title)) role = "DIR";
    else role = "OFF";
  } else if (isDirector === "1" || isDirector === "TRUE" || isDirector === "Y" || isDirector === "YES") {
    role = "DIR";
  } else if (isOfficer === "1" || isOfficer === "TRUE" || isOfficer === "Y" || isOfficer === "YES") {
    role = "OFF";
  }

  return { name: name?.trim() || null, role };
}

/** Transaction + owner XML only (not the full filing) for optional LLM context. */
export function extractFormXmlTransactionFragments(xml: string, maxChars = 12_000): string {
  const parts: string[] = [];
  const ownerBlocks =
    xml.match(/<(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner>/gi) ??
    [];
  parts.push(...ownerBlocks);
  const txBlocks = [
    ...(xml.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction>/gi,
    ) ?? []),
    ...(xml.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?derivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?derivativeTransaction>/gi,
    ) ?? []),
  ];
  parts.push(...txBlocks);
  const joined = parts.join("\n");
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}
