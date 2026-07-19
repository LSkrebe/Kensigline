/** Document source catalog — ids align with frontend `researchPaperSources.js`. */

export const SOURCE_KEYS = [
  "8-K",
  "10-K",
  "10-Q",
  "6-K",
  "20-F",
  "S-1",
  "S-3",
  "S-4",
  "DEF 14A",
  "424B",
  "SC 13D",
  "SC 13G",
  "Press release",
  "Earnings transcript",
  "Investor presentation",
  "Annual report",
  "Gov contract",
  "Form 4",
  "Form 3",
  "Form 5",
  "13F",
  "PTR",
  "Other",
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

export const RESEARCH_PAPER_SOURCE_CATALOG = [
  { id: "8-K", label: "Current report", code: "8-K", modes: ["market"] as const },
  { id: "10-Q", label: "Quarterly report", code: "10-Q", modes: ["market"] as const },
  { id: "10-K", label: "Annual filing", code: "10-K", modes: ["market"] as const },
  { id: "6-K", label: "Foreign current", code: "6-K", modes: ["market"] as const },
  { id: "20-F", label: "Foreign annual", code: "20-F", modes: ["market"] as const },
  { id: "S-1", label: "Registration", code: "S-1", modes: ["market"] as const },
  { id: "S-3", label: "Shelf registration", code: "S-3", modes: ["market"] as const },
  { id: "S-4", label: "Business combination", code: "S-4", modes: ["market"] as const },
  { id: "DEF 14A", label: "Proxy statement", code: "14A", modes: ["market"] as const },
  { id: "424B", label: "Prospectus supplement", code: "424B", modes: ["market"] as const },
  { id: "SC 13D", label: "Active ownership", code: "13D", modes: ["market"] as const },
  { id: "SC 13G", label: "Passive ownership", code: "13G", modes: ["market"] as const },
  { id: "Press release", label: "Company release", code: "PR", modes: ["market"] as const },
  { id: "Earnings transcript", label: "Earnings call", code: "Call", modes: ["market"] as const },
  { id: "Investor presentation", label: "Investor deck", code: "Deck", modes: ["market"] as const },
  { id: "Annual report", label: "IR annual report", code: "AR", modes: ["market"] as const },
  { id: "Gov contract", label: "Federal award", code: "SAM", modes: ["market"] as const },
  { id: "Form 4", label: "Insider transaction", code: "F4", modes: ["market"] as const },
  { id: "Form 3", label: "Initial insider holding", code: "F3", modes: ["market"] as const },
  { id: "Form 5", label: "Annual insider change", code: "F5", modes: ["market"] as const },
  { id: "13F", label: "Institutional holdings", code: "13F", modes: ["market"] as const },
  { id: "PTR", label: "Politician trade", code: "PTR", modes: ["market"] as const },
];

export function sourceKeyFromQueueType(sourceType: string): string | null {
  const s = String(sourceType ?? "").toLowerCase();
  if (s === "research_press_rss" || s === "bosha_press_rss") return "Press release";
  if (s === "research_transcript_rss" || s === "bosha_transcript_rss") return "Earnings transcript";
  if (s === "research_gov_contract" || s === "bosha_gov_contract") return "Gov contract";
  return null;
}

export function normalizeSourceKey(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const hit = SOURCE_KEYS.find((k) => k.toLowerCase() === s.toLowerCase());
  return hit ?? s;
}

function normalizeSecFilingFormKey(raw: string): string | null {
  let s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (!s) return null;
  s = s.replace(/\/A$/, "");
  if (s.startsWith("424B")) return "424B";
  if (s === "DEF14A") return "DEF 14A";
  if (s.startsWith("SC 13D") || s === "SC13D") return "SC 13D";
  if (s.startsWith("SC 13G") || s === "SC13G") return "SC 13G";
  const known = ["8-K", "10-K", "10-Q", "6-K", "20-F", "S-1", "S-3", "S-4", "DEF 14A"];
  return known.includes(s) ? s : null;
}

/** Map stored / raw source strings to filter checkbox ids. */
export function normalizeResearchPaperSourceKey(source: unknown): string {
  const raw = String(source ?? "").trim();
  if (!raw) return "Other";
  const low = raw.toLowerCase();

  if (low === "research_press_rss" || /\bpress\s*release\b/i.test(raw)) return "Press release";
  if (
    low === "research_transcript_rss" ||
    /\bearnings\s*(call\s*)?transcript\b/i.test(raw) ||
    /\bconference\s*call\s*transcript\b/i.test(raw)
  ) {
    return "Earnings transcript";
  }
  if (low === "sec_form4" || /^form\s*4$/i.test(raw)) return "Form 4";
  if (low === "sec_13f" || /^form\s*13f$/i.test(raw) || raw === "13F") return "13F";
  if (/^form\s*3$/i.test(raw)) return "Form 3";
  if (/^form\s*5$/i.test(raw)) return "Form 5";
  if (
    low === "house_ptr" ||
    low === "senate_ptr" ||
    low === "oge_278t" ||
    /^ptr$/i.test(raw) ||
    /\b278[\s-]*t\b/i.test(raw) ||
    /\bperiodic\s*transaction\b/i.test(raw)
  ) {
    return "PTR";
  }
  if (/\binvestor\s*presentation\b/i.test(raw)) return "Investor presentation";
  if (/\bannual\s*report\b/i.test(raw) && !/\b10-k\b/i.test(raw)) return "Annual report";
  if (
    /\bgov(ernment)?\s*contract\b/i.test(raw) ||
    /\bfederal\s*award\b/i.test(raw) ||
    /\bsam\.gov\b/i.test(raw) ||
    low === "research_gov_contract"
  ) {
    return "Gov contract";
  }
  if (/\bsec\s*filing\b/i.test(raw)) return "8-K";
  if (/\bfda\s*calendar\b/i.test(raw)) return "Press release";

  const secDirect = normalizeSecFilingFormKey(raw);
  if (secDirect) return secDirect;

  const secInText = raw.match(/\b(8-K|10-K|10-Q|6-K|20-F|S-1|S-3|S-4|DEF\s*14A|424B\d*|SC\s*13[DG])\b/i);
  if (secInText) {
    const mapped = normalizeSecFilingFormKey(secInText[1]!);
    if (mapped) return mapped;
  }

  return normalizeSourceKey(raw, "Other");
}

export function parseSourceKeyFilterParam(raw: string | null | undefined): Set<string> | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const keys = s
    .split(",")
    .map((k) => normalizeResearchPaperSourceKey(k.trim()))
    .filter(Boolean);
  return keys.length ? new Set(keys) : null;
}
