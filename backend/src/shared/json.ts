/** Parse LLM JSON output (strip fences, salvage object substring). */
export function extractJsonObject(text: string): any {
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    const s2 = raw.indexOf("[");
    const e2 = raw.lastIndexOf("]");
    if (s2 >= 0 && e2 > s2) return JSON.parse(raw.slice(s2, e2 + 1));
    throw new Error("llm_output_not_json");
  }
}

export function formatIso(ts: unknown): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
