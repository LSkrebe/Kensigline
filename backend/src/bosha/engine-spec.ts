/**
 * BOSHA — graph-based market intelligence engine (policy constants).
 * Ingestion allowlist, exploration limits, and output contract for explore + papers.
 */

/** Single structural question the engine answers (no narrative / summary). */
export const BOSHA_OUTPUT_PRINCIPLE =
  "What structural relationship is being mispriced due to missing causal links?";

export const BOSHA_MAX_GRAPH_DEPTH = 3;
export const BOSHA_MAX_EXPANSIONS_PER_ENTITY = 20;

export const BOSHA_CLAIM_TYPES = [
  "supply_chain",
  "demand",
  "capacity",
  "risk",
  "pricing",
] as const;

/** Graph edge vocabulary persisted on `bosha_relationships.rel_type`. */
export const BOSHA_EDGE_TYPES = [
  "uses",
  "supplies",
  "depends_on",
  "competes_with",
  "partners_with",
  "mentions",
] as const;

export type BoshaEdgeType = (typeof BOSHA_EDGE_TYPES)[number];

/** Host suffixes (lowercase) allowed for non-SEC HTTP ingest (press / transcripts / tech blogs). */
const HTTP_INGEST_HOST_SUFFIXES: string[] = [
  "sec.gov",
  "quartr.com",
  "seekingalpha.com",
  "prnewswire.com",
  "businesswire.com",
  "globenewswire.com",
  "research.google",
  "blog.google",
  "nvidia.com",
  "developer.nvidia.com",
  "aws.amazon.com",
  "azure.microsoft.com",
  "microsoft.com",
  "engineering.fb.com",
  "meta.com",
  "arxiv.org",
  "ieee.org",
  "ieeexplore.ieee.org",
  "opencompute.org",
  "semianalysis.com",
  "trendforce.com",
  "digitimes.com",
  "eetimes.com",
  "ctee.com.tw",
  "chinatimes.com",
  "udn.com",
  "nikkei.com",
  "asia.nikkei.com",
  "polygon.io",
  "finra.org",
  "cboe.com",
  "linkedin.com",
  "greenhouse.io",
  "lever.co",
];

function hostnameOf(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True if this HTTP(S) URL may be ingested for Bosha press/transcript pipelines. */
export function isUrlAllowedForBoshaHttpIngest(urlStr: string): boolean {
  const host = hostnameOf(urlStr);
  if (!host) return false;
  for (const suf of HTTP_INGEST_HOST_SUFFIXES) {
    if (host === suf || host.endsWith(`.${suf}`)) return true;
  }
  return false;
}
