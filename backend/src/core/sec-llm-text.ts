/**
 * Shrink SEC filing text for LLM input while preserving full text as fallback
 * so no exhibit / item content is dropped when section parsing finds little signal.
 */

import { stripBoilerplateForLlm } from "./boilerplate-strip.js";

const SEC_ITEM_HEADINGS = [
  "1.01",
  "1.02",
  "2.01",
  "2.02",
  "2.03",
  "2.04",
  "2.05",
  "2.06",
  "3.01",
  "3.02",
  "3.03",
  "4.01",
  "4.02",
  "5.01",
  "5.02",
  "5.03",
  "5.07",
  "7.01",
  "8.01",
  "9.01",
] as const;

/** Pull 8-K / 10-K style ITEM blocks and exhibit headers with local body text. */
export function extractRelevantSecSections(fullText: string, maxChars: number): string {
  const text = stripBoilerplateForLlm(String(fullText ?? ""));
  if (!text) return "";

  const lower = text.toLowerCase();
  const chunks: Array<{ at: number; body: string }> = [];

  for (const item of SEC_ITEM_HEADINGS) {
    const marker = `item ${item}`;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(marker, from);
      if (at < 0) break;
      const start = Math.max(0, at - 40);
      const nextItem = lower.indexOf("\nitem ", at + marker.length);
      const nextForm = lower.indexOf("\nform ", at + marker.length);
      const endCandidates = [nextItem, nextForm].filter((x) => x > at);
      const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(text.length, at + 24_000);
      chunks.push({ at: start, body: text.slice(start, end).trim() });
      from = at + marker.length;
    }
  }

  const exhibitRe = /\bEX[-\s]?99\.\d+\b/gi;
  let em: RegExpExecArray | null;
  while ((em = exhibitRe.exec(text)) != null) {
    const start = Math.max(0, em.index - 20);
    const end = Math.min(text.length, em.index + 18_000);
    chunks.push({ at: start, body: text.slice(start, end).trim() });
  }

  if (!chunks.length) return text.slice(0, maxChars);

  chunks.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of chunks) {
    const key = c.body.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(c.body);
  }

  const joined = parts.join("\n\n---\n\n");
  if (joined.length < 1_500) return text.slice(0, maxChars);
  return joined.slice(0, maxChars);
}

/** Prefer extracted sections; fall back to the legacy full slice when extraction is thin. */
export function compactSecTextForLlm(fullText: string, maxChars: number): string {
  const stripped = stripBoilerplateForLlm(fullText);
  const extracted = extractRelevantSecSections(stripped, maxChars);
  const legacy = stripped.slice(0, maxChars);
  if (extracted.length >= Math.min(2_000, Math.floor(legacy.length * 0.15))) {
    return extracted;
  }
  return legacy;
}

export function estimateCharsSaved(fullText: string, maxChars: number): number {
  const legacy = String(fullText ?? "").slice(0, maxChars);
  const compact = compactSecTextForLlm(fullText, maxChars);
  return Math.max(0, legacy.length - compact.length);
}

const PHARMA_KEYWORDS = [
  "clinical trial",
  "phase i",
  "phase ii",
  "phase iii",
  "phase 1",
  "phase 2",
  "phase 3",
  "enrollment",
  "topline",
  "top-line",
  "primary endpoint",
  "secondary endpoint",
  "fda",
  "ind application",
  "nda",
  "bla",
  "adverse event",
  "safety data",
  "efficacy",
  "pivotal study",
  "data readout",
  "study completion",
  "primary completion",
  "regulatory approval",
  "breakthrough therapy",
  "fast track",
] as const;

const PHARMA_ITEM_MARKERS = ["item 1.", "item 1a.", "item 7.", "item 8."] as const;

/** Keyword windows around clinical / regulatory passages; falls back to compactSecTextForLlm. */
export function compactPharmaTextForLlm(fullText: string, maxChars: number): string {
  const text = stripBoilerplateForLlm(String(fullText ?? ""));
  if (!text) return "";

  const lower = text.toLowerCase();
  const chunks: Array<{ at: number; body: string }> = [];

  for (const kw of PHARMA_KEYWORDS) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(kw, from);
      if (at < 0) break;
      const start = Math.max(0, at - 400);
      const end = Math.min(text.length, at + 3_500);
      chunks.push({ at: start, body: text.slice(start, end).trim() });
      from = at + kw.length;
    }
  }

  for (const item of PHARMA_ITEM_MARKERS) {
    const marker = `\n${item}`;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(marker, from);
      if (at < 0) break;
      const start = Math.max(0, at);
      const nextItem = lower.indexOf("\nitem ", at + marker.length);
      const end = nextItem > at ? nextItem : Math.min(text.length, at + 20_000);
      chunks.push({ at: start, body: text.slice(start, end).trim() });
      from = at + marker.length;
    }
  }

  if (!chunks.length) return compactSecTextForLlm(text, maxChars);

  chunks.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of chunks) {
    const key = c.body.slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(c.body);
  }

  const joined = parts.join("\n\n---\n\n");
  if (joined.length < 2_000) return compactSecTextForLlm(text, maxChars);
  return joined.slice(0, maxChars);
}
