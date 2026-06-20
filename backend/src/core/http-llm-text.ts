/**
 * Shrink HTTP article text for LLM input. Falls back to the legacy full slice
 * when extraction finds too little signal (same safety model as sec-llm-text).
 */

import { stripBoilerplateForLlm } from "./boilerplate-strip.js";

const PRESS_SIGNAL =
  /\b(announc|report|revenue|earnings|guidance|merger|acquisition|partnership|collaboration|contract|fda|clinical|financ|profit|loss|dividend|buyback|offering)\b/i;

const TRANSCRIPT_SIGNAL =
  /\b(operator|question-and-answer|questions and answers|conference call|earnings call|prepared remarks|forward-looking)\b/i;

function paragraphs(text: string): string[] {
  return String(text ?? "")
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40);
}

function windowAroundMatches(text: string, re: RegExp, window = 900, maxParts = 24): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = global.exec(lower)) != null && out.length < maxParts) {
    const start = Math.max(0, m.index - window);
    const end = Math.min(text.length, m.index + m[0].length + window);
    out.push(text.slice(start, end).trim());
  }
  return out;
}

function dedupeParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function extractPressArticleSections(fullText: string, maxChars: number): string {
  const text = stripBoilerplateForLlm(String(fullText ?? ""));
  if (!text) return "";

  const paras = paragraphs(text);
  const lead = paras.slice(0, 3);
  const signalParas = paras.filter((p) => PRESS_SIGNAL.test(p));
  const windows = windowAroundMatches(text, PRESS_SIGNAL, 700, 16);

  const parts = dedupeParts([...lead, ...signalParas, ...windows]);
  const joined = parts.join("\n\n");
  if (joined.length < 1_500) return text.slice(0, maxChars);
  return joined.slice(0, maxChars);
}

export function extractTranscriptSections(fullText: string, maxChars: number): string {
  const text = stripBoilerplateForLlm(String(fullText ?? ""));
  if (!text) return "";

  const paras = paragraphs(text);
  const signalParas = paras.filter((p) => TRANSCRIPT_SIGNAL.test(p) || /\b(Q&A|CEO|CFO)\b/i.test(p));
  const windows = windowAroundMatches(text, TRANSCRIPT_SIGNAL, 1_000, 14);
  const qnaStart = text.search(/question[\s-]*and[\s-]*answer|q\s*&\s*a/i);
  const qnaBlock =
    qnaStart >= 0 ? text.slice(qnaStart, Math.min(text.length, qnaStart + 12_000)) : "";

  const parts = dedupeParts([
    ...paras.slice(0, 3),
    ...signalParas.slice(0, 12),
    ...windows,
    ...(qnaBlock ? [qnaBlock] : []),
  ]);
  const joined = parts.join("\n\n");
  if (joined.length < 2_000) return text.slice(0, maxChars);
  return joined.slice(0, maxChars);
}

export function extractGovContractSections(fullText: string, maxChars: number): string {
  const text = stripBoilerplateForLlm(String(fullText ?? ""));
  if (!text) return "";

  const signal =
    /\b(contract|award|sam\.gov|federal|agency|obligat|recipient|naics|period of performance|ceiling|obligated|piid)\b/i;
  const paras = paragraphs(text).filter((p) => signal.test(p));
  const windows = windowAroundMatches(text, signal, 600, 12);
  const parts = dedupeParts([...paras.slice(0, 6), ...windows]);
  const joined = parts.join("\n\n");
  if (joined.length < 800) return text.slice(0, maxChars);
  return joined.slice(0, maxChars);
}

export type HttpLlmTextMode = "press" | "transcript" | "gov";

export function compactHttpTextForLlm(fullText: string, mode: HttpLlmTextMode, maxChars: number): string {
  const stripped = stripBoilerplateForLlm(fullText);
  const legacy = stripped.slice(0, maxChars);
  const extracted =
    mode === "transcript"
      ? extractTranscriptSections(stripped, maxChars)
      : mode === "gov"
        ? extractGovContractSections(stripped, maxChars)
        : extractPressArticleSections(stripped, maxChars);

  const minGood = Math.min(2_000, Math.floor(legacy.length * 0.12));
  if (extracted.length >= minGood) return extracted;
  return legacy;
}

/** House PTR PDF text — keep header + transaction-like lines. */
export function compactPtrPdfTextForLlm(fullText: string, maxChars: number): string {
  const text = String(fullText ?? "");
  if (!text) return "";

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 35).join("\n");
  const signal = lines.filter(
    (line) =>
      /\([A-Z]{1,5}\)/.test(line) ||
      /\$[\d,]+/.test(line) ||
      /\b(transaction|purchase|sale|exchange|asset|ticker|amount|notification)\b/i.test(line) ||
      /\b[A-Z]{1,5}\b/.test(line) && /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line),
  );
  const joined = dedupeParts([head, ...signal]).join("\n");
  if (joined.length < 1_500) return text.slice(0, maxChars);
  return joined.slice(0, maxChars);
}
