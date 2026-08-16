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

const ALL_PIPELINE_IDS: BackfillPipelineId[] = ["research", "politicians", "insider", "institutions"];

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function backfillParseSlotMax(): number {
  return envInt("BACKFILL_PARSE_SLOT_MAX", 20, 1, 24);
}

/** When false (default), backfill never enables live SEC/RSS enqueue — gate stays env-controlled. */
export function backfillAllowsLiveEnqueue(): boolean {
  return String(process.env.BACKFILL_LIVE_ENQUEUE ?? "0").trim() === "1";
}

/** `parallel` = current multi-pipeline walk; `sequential` = one pipeline at a time (catch-up runs). */
export function backfillScheduleMode(): "parallel" | "sequential" {
  const raw = String(process.env.BACKFILL_SCHEDULE ?? "parallel").trim().toLowerCase();
  return raw === "sequential" ? "sequential" : "parallel";
}

export function parseBackfillSequence(): BackfillPipelineId[] {
  const raw = String(process.env.BACKFILL_SEQUENCE ?? "research,politicians,insider,institutions").trim();
  const valid = new Set<BackfillPipelineId>(ALL_PIPELINE_IDS);
  const ordered: BackfillPipelineId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim() as BackfillPipelineId;
    if (valid.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of ALL_PIPELINE_IDS) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/** `short_first` finishes the smaller backlog before flooding the slow 13F walk. */
export function backfillWeightMode(): "days" | "short_first" {
  const raw = String(process.env.BACKFILL_WEIGHT_MODE ?? "short_first").trim().toLowerCase();
  return raw === "days" || raw === "long_first" ? "days" : "short_first";
}

function pipelineWeight(s: PipelineBackfillStatus, mode: "days" | "short_first"): number {
  const days = Math.max(1, s.daysRemaining);
  if (mode === "short_first") return (1 / days) * s.weightMultiplier;
  return days * s.weightMultiplier;
}

function doneCapacity(doneMin: number): PipelineCapacity {
  return { parseConcurrency: doneMin, liveEnqueue: false, historicalBackfill: false };
}

/** All historical walks finished — max out parse for drain; live stays off. */
function drainCapacity(maxParse: number, slotMax: number): PipelineCapacity {
  return {
    parseConcurrency: Math.max(1, Math.min(slotMax, maxParse)),
    liveEnqueue: false,
    historicalBackfill: false,
  };
}

function waitingCapacity(doneMin: number): PipelineCapacity {
  return { parseConcurrency: doneMin, liveEnqueue: false, historicalBackfill: false };
}

/** One pipeline at a time — full parse budget to the current step in BACKFILL_SEQUENCE. */
export function computeSequentialBackfillCapacity(
  statuses: PipelineBackfillStatus[],
): Map<BackfillPipelineId, PipelineCapacity> {
  const doneMin = envInt("BACKFILL_DONE_PARSE_MIN", 1, 1, 4);
  const slotMax = backfillParseSlotMax();
  const allowLive = backfillAllowsLiveEnqueue();
  const sequence = parseBackfillSequence();
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const result = new Map<BackfillPipelineId, PipelineCapacity>();

  let current: BackfillPipelineId | null = null;
  for (const id of sequence) {
    const s = byId.get(id);
    if (s && !s.done) {
      current = id;
      break;
    }
  }

  if (!current) {
    for (const id of ALL_PIPELINE_IDS) {
      const s = byId.get(id);
      if (!s) continue;
      result.set(id, drainCapacity(s.maxParse, slotMax));
    }
    return result;
  }

  for (const id of ALL_PIPELINE_IDS) {
    const s = byId.get(id);
    if (!s) continue;
    if (s.done) {
      result.set(id, doneCapacity(doneMin));
    } else if (id === current) {
      result.set(id, {
        parseConcurrency: slotMax,
        liveEnqueue: allowLive,
        historicalBackfill: true,
      });
    } else {
      result.set(id, waitingCapacity(doneMin));
    }
  }

  return result;
}

/** Multi-pipeline walk — finished pipelines donate parse slots to active ones. */
export function computeParallelBackfillCapacity(
  statuses: PipelineBackfillStatus[],
): Map<BackfillPipelineId, PipelineCapacity> {
  const doneMin = envInt("BACKFILL_DONE_PARSE_MIN", 1, 1, 4);
  const slotMax = backfillParseSlotMax();
  const allowLive = backfillAllowsLiveEnqueue();

  let totalBudget = envInt("BACKFILL_PARSE_BUDGET_TOTAL", 0, 0, 64);
  if (totalBudget <= 0) {
    totalBudget = statuses.reduce((sum, s) => sum + s.maxParse, 0);
  }

  const result = new Map<BackfillPipelineId, PipelineCapacity>();
  const active = statuses.filter((s) => !s.done);
  const done = statuses.filter((s) => s.done);

  if (active.length === 0) {
    for (const s of done) {
      result.set(s.id, drainCapacity(s.maxParse, slotMax));
    }
    return result;
  }

  for (const s of done) {
    result.set(s.id, doneCapacity(doneMin));
  }

  const reservedForDone = done.length * doneMin;
  const pool = Math.max(active.length, totalBudget - reservedForDone);

  const mode = backfillWeightMode();
  const weights = active.map((s) => pipelineWeight(s, mode));
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
      liveEnqueue: allowLive,
      historicalBackfill: true,
    });
  }

  return result;
}

export function computeBackfillCapacity(statuses: PipelineBackfillStatus[]): Map<BackfillPipelineId, PipelineCapacity> {
  if (backfillScheduleMode() === "sequential") {
    return computeSequentialBackfillCapacity(statuses);
  }
  return computeParallelBackfillCapacity(statuses);
}
