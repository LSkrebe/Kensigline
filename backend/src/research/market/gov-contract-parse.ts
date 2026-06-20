import type { ResearchDocExtractV2 } from "../../documents/extract.js";
import { paragraphHasMaterialSignal } from "../../core/boilerplate-strip.js";

export type GovContractFacts = {
  recipient: string | null;
  agency: string | null;
  awardId: string | null;
  amountUsd: number | null;
  naics: string | null;
  period: string | null;
  description: string | null;
};

function parseMoney(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.replace(/[$,\s]/g, "").trim();
  const m = s.match(/^([\d.]+)\s*(million|billion|m|b|mm|bn)?$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = String(m[2] ?? "").toLowerCase();
  if (unit === "billion" || unit === "b" || unit === "bn") n *= 1_000_000_000;
  else if (unit === "million" || unit === "m" || unit === "mm") n *= 1_000_000;
  return n;
}

/** Best-effort structured parse for SAM.gov / contract award pages. */
export function parseGovContractFacts(text: string): GovContractFacts {
  const t = String(text ?? "");
  const pick = (re: RegExp) => {
    const m = t.match(re);
    return m?.[1]?.trim() ?? null;
  };

  return {
    recipient:
      pick(/(?:recipient|awardee|contractor)[:\s]+([^\n]{3,120})/i) ??
      pick(/(?:entity name|company)[:\s]+([^\n]{3,120})/i),
    agency:
      pick(/(?:agency|department|contracting office)[:\s]+([^\n]{3,120})/i) ??
      pick(/(?:federal agency)[:\s]+([^\n]{3,120})/i),
    awardId:
      pick(/(?:award id|contract id|piid|notice id)[:\s#]*([A-Z0-9-]{6,40})/i) ??
      pick(/\b(PIID[:\s#]*[A-Z0-9-]{6,40})/i),
    amountUsd:
      parseMoney(pick(/(?:award amount|obligated amount|total contract value|ceiling)[:\s$]*([\d,.]+\s*(?:million|billion|m|b|mm|bn)?)/i)) ??
      parseMoney(pick(/\$\s*([\d,.]+\s*(?:million|billion|m|b|mm|bn)?)/i)),
    naics: pick(/(?:naics)[:\s#]*(\d{6})/i),
    period:
      pick(/(?:period of performance|performance period)[:\s]+([^\n]{6,120})/i) ??
      pick(/(?:award date)[:\s]+([^\n]{6,40})/i),
    description: pick(/(?:description|requirement|purpose)[:\s]+([^\n]{20,220})/i),
  };
}

export function govContractParseConfidence(facts: GovContractFacts): number {
  let score = 0;
  if (facts.recipient) score += 1;
  if (facts.agency) score += 1;
  if (facts.awardId) score += 1;
  if (facts.amountUsd != null) score += 1;
  if (facts.naics) score += 0.5;
  if (facts.period) score += 0.5;
  if (facts.description && paragraphHasMaterialSignal(facts.description)) score += 0.5;
  return score;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Deterministic research card when structured gov fields are strong enough. */
export function buildGovContractExtractFromFacts(
  facts: GovContractFacts,
  args: { url: string; hintedTicker: string | null },
): ResearchDocExtractV2 | null {
  if (govContractParseConfidence(facts) < 3.5) return null;

  const recipient = facts.recipient ?? "Contractor";
  const agency = facts.agency ?? "Federal agency";
  const amount =
    facts.amountUsd != null ? formatUsd(facts.amountUsd) : null;
  const titleParts = [
    amount ? `${amount} award` : "Federal contract award",
    agency !== "Federal agency" ? `from ${agency}` : null,
  ].filter(Boolean);

  const title = titleParts.join(" ").slice(0, 120);
  const analysisParts = [
    `${recipient} received a federal contract`,
    amount ? `valued at about ${amount}` : null,
    facts.awardId ? `(award ${facts.awardId})` : null,
    facts.period ? `with performance ${facts.period}` : null,
  ].filter(Boolean);

  const analysis = `${analysisParts.join(" ")}.`.replace(/\s+/g, " ").trim();
  if (analysis.length < 40 || title.length < 8) return null;

  return {
    schema_type: "research_doc_v2",
    schema_version: "v2",
    title,
    primary_ticker: args.hintedTicker?.trim().toUpperCase() ?? null,
    source_key: "Gov contract",
    analysis,
    event_at: null,
    program_keys: [],
    link_confidence: args.hintedTicker ? 0.72 : 0.55,
  };
}

export function compactGovContractFactsForLlm(facts: GovContractFacts, maxChars: number): string {
  const lines = [
    facts.recipient ? `Recipient: ${facts.recipient}` : null,
    facts.agency ? `Agency: ${facts.agency}` : null,
    facts.awardId ? `Award ID: ${facts.awardId}` : null,
    facts.amountUsd != null ? `Amount USD: ${facts.amountUsd}` : null,
    facts.naics ? `NAICS: ${facts.naics}` : null,
    facts.period ? `Period: ${facts.period}` : null,
    facts.description ? `Description: ${facts.description}` : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, maxChars);
}
