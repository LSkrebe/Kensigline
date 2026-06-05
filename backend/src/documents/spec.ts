/**
 * Research document ingest policy (HTTP allowlist, env helpers).
 */

import { QUEUE_SOURCES } from "../pipelines/registry.js";

/** Host suffixes allowed for non-SEC HTTP ingest (press / transcripts). */
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

import { envNum, envStr } from "../shared/env.js";

/** Read RESEARCH_* env with optional legacy BOSHA_* fallback. */
export function researchEnv(key: string, fallback = ""): string {
  return envStr("RESEARCH", key, fallback, "BOSHA");
}

export function researchEnvNum(key: string, fallback: number): number {
  return envNum("RESEARCH", key, fallback, "BOSHA");
}

export function isUrlAllowedForResearchHttpIngest(urlStr: string): boolean {
  const host = hostnameOf(urlStr);
  if (!host) return false;
  for (const suf of HTTP_INGEST_HOST_SUFFIXES) {
    if (host === suf || host.endsWith(`.${suf}`)) return true;
  }
  return false;
}

/** Queue source_type values for the research document worker. */
export const RESEARCH_QUEUE_SOURCE_TYPES = QUEUE_SOURCES.researchMarket;
