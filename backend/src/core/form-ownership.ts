/** Parse beneficial ownership from SEC Form 3/4/5 ownership XML (no LLM). */

function firstXmlTagText(xml: string, tag: string): string | null {
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

function extractBlockShares(block: string): number | null {
  const owned =
    parseNumberLoose(firstXmlTagText(block, "sharesOwnedFollowingTransaction")) ??
    parseNumberLoose(firstXmlTagText(block, "sharesOwned")) ??
    parseNumberLoose(firstXmlTagText(block, "valueOwnedFollowingTransaction"));
  return owned != null && owned >= 0 ? owned : null;
}

function sumBlockShares(block: string): number | null {
  const holdings =
    block.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeHolding\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeHolding>/gi,
    ) ?? [];
  const txns =
    block.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction>/gi,
    ) ?? [];
  const blocks = [...holdings, ...txns];
  if (!blocks.length) return extractBlockShares(block);

  let total = 0;
  let any = false;
  for (const b of blocks) {
    const n = extractBlockShares(b);
    if (n == null) continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}

export type ReportingOwnerHoldings = { owner: string; shares: number };

/** Per reporting owner, sum beneficial shares in one filing. */
export function reportingOwnersFromOwnershipXml(xml: string): ReportingOwnerHoldings[] {
  const raw = String(xml ?? "");
  if (!/<\s*ownershipDocument\b/i.test(raw)) return [];

  const ownerBlocks =
    raw.match(/<(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?reportingOwner>/gi) ??
    [];

  const pool = ownerBlocks.length ? ownerBlocks : [raw];
  const out: ReportingOwnerHoldings[] = [];

  for (const block of pool) {
    const owner = firstXmlTagText(block, "rptOwnerName")?.trim();
    const shares = sumBlockShares(block);
    if (!owner || shares == null) continue;
    out.push({ owner, shares });
  }

  return out;
}

/** Sum post-transaction / reported shares across all owners in one filing. */
export function beneficialSharesFromOwnershipXml(xml: string): number | null {
  const owners = reportingOwnersFromOwnershipXml(xml);
  if (!owners.length) return null;
  return owners.reduce((a, o) => a + o.shares, 0);
}
