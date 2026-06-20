/**
 * Strip obvious legal / IR boilerplate before LLM input.
 * Keeps paragraphs that contain material numbers, dates, or event keywords.
 */

const BOILERPLATE_HEADING =
  /^(?:forward[- ]looking statements?|safe harbor|cautionary (?:note|statement)|about (?:the company|[\w\s,.-]{0,60}(?:inc\.?|corp\.?|llc|l\.?p\.?|plc|limited|company)))\b|investor relations\b|media contact\b|for more information\b|contacts?\s*:|signatures?\s*$/i;

const COPYRIGHT_FOOTER =
  /^(?:copyright|©|\(c\)|all rights reserved|privacy policy|terms of use|unsubscribe|to opt out)/i;

const MATERIAL_SIGNAL =
  /\$[\d,.]+(?:\s*(?:million|billion|m|b|mm|bn))?|\d+\.?\d*\s*%|\b(?:revenue|eps|ebitda|guidance|outlook|fda|approval|phase\s*(?:i{1,3}|[123])|enrollment|topline|nda|bla|merger|acquisition|contract|award|obligat|ceiling|partnership|collaboration|trial|study|readout|catalyst|rate case|tariff)\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:Q[1-4]|FY)\s*20\d{2}\b/i;

const CONTACT_LINE =
  /\b(?:@|mailto:|tel:|phone:|\+1[\s(]|\(\d{3}\)\s*\d{3}[- ]?\d{4})\b/i;

function normalizeParagraph(p: string): string {
  return String(p ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function paragraphHasMaterialSignal(text: string): boolean {
  const t = normalizeParagraph(text);
  if (!t) return false;
  if (MATERIAL_SIGNAL.test(t)) return true;
  // Keep dense numeric paragraphs even without keywords.
  const digits = (t.match(/\d/g) ?? []).length;
  return digits >= 6 && t.length >= 80;
}

function isContactBlock(text: string): boolean {
  const t = normalizeParagraph(text);
  if (!t || t.length > 900) return false;
  const lines = t.split(/(?<=[.!?])\s+/);
  const contactLines = lines.filter((l) => CONTACT_LINE.test(l)).length;
  return contactLines >= 1 && contactLines / Math.max(1, lines.length) >= 0.4;
}

function isCopyrightFooter(text: string): boolean {
  const t = normalizeParagraph(text);
  return t.length <= 320 && COPYRIGHT_FOOTER.test(t);
}

/** Remove boilerplate sections while preserving material facts. */
export function stripBoilerplateForLlm(text: string): string {
  let raw = String(text ?? "");
  if (!raw) return "";

  const sigMatch = raw.match(/\n\s*SIGNATURES?\s*(?:\n|$)/i);
  if (sigMatch?.index != null && sigMatch.index > raw.length * 0.45) {
    raw = raw.slice(0, sigMatch.index);
  }

  const paras = raw.split(/\n{2,}|\r\n{2,}/);
  const out: string[] = [];
  let skipSection = false;

  for (const para of paras) {
    const p = normalizeParagraph(para);
    if (!p || p.length < 18) continue;

    const head = p.slice(0, 140);
    if (BOILERPLATE_HEADING.test(head) && !paragraphHasMaterialSignal(p)) {
      skipSection = true;
      continue;
    }

    if (skipSection) {
      if (paragraphHasMaterialSignal(p)) {
        skipSection = false;
        out.push(p);
      }
      continue;
    }

    if (isContactBlock(p) && !paragraphHasMaterialSignal(p)) continue;
    if (isCopyrightFooter(p) && !paragraphHasMaterialSignal(p)) continue;

    out.push(p);
  }

  return out.join("\n\n");
}
