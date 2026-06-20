import { createHash } from "node:crypto";
import { stripBoilerplateForLlm } from "./boilerplate-strip.js";
import { normalizeTextForHash } from "./text-hash.js";
import type { ResearchDocExtractV2 } from "../documents/extract.js";

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "announced",
  "company",
  "from",
  "have",
  "inc",
  "into",
  "more",
  "said",
  "that",
  "their",
  "this",
  "today",
  "will",
  "with",
  "would",
]);

/** Stable fingerprint of material document text for near-duplicate reuse. */
export function computeResearchNearDupKey(text: string): string {
  const core = stripBoilerplateForLlm(text);
  const normalized = normalizeTextForHash(core).toLowerCase();
  const tokens = [
    ...new Set(
      (normalized.match(/\b[a-z0-9]{3,}\b|\$?\d[\d,.]*%?/g) ?? []).filter((t) => !STOPWORDS.has(t)),
    ),
  ]
    .sort()
    .slice(0, 180);
  return createHash("sha256").update(tokens.join("|"), "utf8").digest("hex").slice(0, 24);
}

function shingles(text: string, size = 5): Set<string> {
  const words = normalizeTextForHash(stripBoilerplateForLlm(text))
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

export function textShingleSimilarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter += 1;
  return inter / Math.max(sa.size, sb.size);
}

export function attachNearDupKey(
  out: ResearchDocExtractV2,
  nearDupKey: string,
  sourceUrl: string,
): ResearchDocExtractV2 & { near_dup_key: string; source_url: string } {
  return { ...out, near_dup_key: nearDupKey, source_url: sourceUrl };
}

export const REUSE_SIMILARITY_THRESHOLD = () =>
  Math.max(0.75, Math.min(0.95, Number(process.env.RESEARCH_NEAR_DUP_SIMILARITY ?? 0.84)));
