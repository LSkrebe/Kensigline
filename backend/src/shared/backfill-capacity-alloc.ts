export type BackfillPipelineId = "insider" | "institutions" | "research" | "politicians";

export type PipelineCapacity = {
  parseConcurrency: number;
  liveEnqueue: boolean;
  historicalBackfill: boolean;
};

export type PipelineBackfillStatus = {
  id: BackfillPipelineId;
  done: boolean;
  daysRemaining: number;
  maxParse: number;
  weightMultiplier: number;
};

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function backfillParseSlotMax(): number {
  return Math.min(16, envInt("BACKFILL_PARSE_SLOT_MAX", 16, 1, 16));
}

/** Pure allocation — finished pipelines donate parse slots to active ones by days remaining. */
export function computeBackfillCapacity(statuses: PipelineBackfillStatus[]): Map<BackfillPipelineId, PipelineCapacity> {
  const doneMin = envInt("BACKFILL_DONE_PARSE_MIN", 1, 1, 4);
  const slotMax = backfillParseSlotMax();

  let totalBudget = envInt("BACKFILL_PARSE_BUDGET_TOTAL", 0, 0, 64);
  if (totalBudget <= 0) {
    totalBudget = statuses.reduce((sum, s) => sum + s.maxParse, 0);
  }

  const result = new Map<BackfillPipelineId, PipelineCapacity>();
  const active = statuses.filter((s) => !s.done);
  const done = statuses.filter((s) => s.done);

  for (const s of done) {
    result.set(s.id, {
      parseConcurrency: doneMin,
      liveEnqueue: false,
      historicalBackfill: false,
    });
  }

  if (active.length === 0) return result;

  const reservedForDone = done.length * doneMin;
  const pool = Math.max(active.length, totalBudget - reservedForDone);

  const weights = active.map((s) => Math.max(1, s.daysRemaining) * s.weightMultiplier);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  const shares = active.map((s, i) => ({
    id: s.id,
    share: Math.max(1, Math.floor((pool * (weights[i] ?? 1)) / totalWeight)),
  }));

  let allocated = shares.reduce((sum, s) => sum + s.share, 0);
  let remainder = pool - allocated;
  const byWeight = [...shares].sort((a, b) => {
    const wa = weights[active.findIndex((s) => s.id === a.id)] ?? 0;
    const wb = weights[active.findIndex((s) => s.id === b.id)] ?? 0;
    return wb - wa;
  });
  for (let i = 0; remainder > 0; i++, remainder--) {
    const row = byWeight[i % byWeight.length];
    if (row) row.share++;
  }

  const assigned = shares.map((s) => ({
    id: s.id,
    effective: Math.min(slotMax, s.share),
    weightRank: weights[active.findIndex((a) => a.id === s.id)] ?? 0,
  }));
  let activeUsed = assigned.reduce((sum, s) => sum + s.effective, 0);
  let spare = pool - activeUsed;
  const ranked = [...assigned].sort((a, b) => b.weightRank - a.weightRank);
  let guard = 0;
  while (spare > 0 && guard++ < pool * ranked.length) {
    const row = ranked.find((r) => r.effective < slotMax);
    if (!row) break;
    row.effective++;
    spare--;
  }

  for (const { id, effective } of assigned) {
    result.set(id, {
      parseConcurrency: effective,
      liveEnqueue: true,
      historicalBackfill: true,
    });
  }

  return result;
}
