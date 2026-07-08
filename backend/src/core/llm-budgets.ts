/** Default LLM input character budgets per source (after compaction). Tune via env overrides. */

function readInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const LLM_BUDGETS = {
  secFiling: () => readInt("LLM_BUDGET_SEC", 24_000),
  pressRelease: () => readInt("LLM_BUDGET_PRESS", 16_000),
  transcript: () => readInt("LLM_BUDGET_TRANSCRIPT", 22_000),
  govContract: () => readInt("LLM_BUDGET_GOV", 14_000),
  pharmaFiling: () => readInt("LLM_BUDGET_PHARMA", 40_000),
  researchExtractCap: () => readInt("LLM_BUDGET_RESEARCH_EXTRACT", 24_000),
  institution13fFull: () => readInt("LLM_BUDGET_13F_FULL", 30_000),
  institution13fCover: () => readInt("LLM_BUDGET_13F_COVER", 4_000),
  housePtr: () => readInt("LLM_BUDGET_HOUSE_PTR", 40_000),
} as const;
