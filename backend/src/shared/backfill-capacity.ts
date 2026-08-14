import { runWithWorkerDb } from "../core/db.js";
import { backfillMaxAgeDays, effectiveBackfillMinDate } from "./ingest-policy.js";
import { getIngestCursor } from "./ingest-cursor.js";
import {
  backfillParseSlotMax,
  computeBackfillCapacity,
  type BackfillPipelineId,
  type PipelineBackfillStatus,
  type PipelineCapacity,
} from "./backfill-capacity-alloc.js";

export type { BackfillPipelineId, PipelineBackfillStatus, PipelineCapacity } from "./backfill-capacity-alloc.js";
export { backfillParseSlotMax, computeBackfillCapacity } from "./backfill-capacity-alloc.js";

type PipelineDef = {
  id: BackfillPipelineId;
  ingestPipeline: string;
  envPrefix: string;
  defaultMaxParse: number;
  weightMultiplier: number;
  usesSecDaily: boolean;
};

const PIPELINES: PipelineDef[] = [
  {
    id: "insider",
    ingestPipeline: "investigate/insider",
    envPrefix: "INSIDER",
    defaultMaxParse: 3,
    weightMultiplier: 1,
    usesSecDaily: true,
  },
  {
    id: "institutions",
    ingestPipeline: "investigate/institutions",
    envPrefix: "INSTITUTIONS",
    defaultMaxParse: 1,
    weightMultiplier: Number(process.env.INSTITUTIONS_BACKFILL_WEIGHT ?? 1) || 1,
    usesSecDaily: true,
  },
  {
    id: "research",
    ingestPipeline: "research/market",
    envPrefix: "RESEARCH",
    defaultMaxParse: 1,
    weightMultiplier: 1,
    usesSecDaily: true,
  },
  {
    id: "politicians",
    ingestPipeline: "investigate/politicians",
    envPrefix: "POLITICIANS",
    defaultMaxParse: 2,
    weightMultiplier: 1,
    usesSecDaily: false,
  },
];

const pipelineById = new Map(PIPELINES.map((p) => [p.id, p]));

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function envNum(prefix: string, key: string, fallback: number): number {
  const n = Number(process.env[`${prefix}_${key}`] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function parseYyyymmdd(raw: string | null): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{8}$/.test(s)) return null;
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  return Number.isNaN(d.getTime()) ? null : d;
}

function calendarDaysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function maxParseForPipeline(def: PipelineDef): number {
  return Math.max(1, Math.min(16, envNum(def.envPrefix, "PARSE_CONCURRENCY", def.defaultMaxParse)));
}

export function backfillDynamicCapacityEnabled(): boolean {
  if (String(process.env.BACKFILL_ENABLED ?? "1").trim() === "0") return false;
  return String(process.env.BACKFILL_DYNAMIC_CAPACITY ?? "1").trim() !== "0";
}

function staticCapacity(def: PipelineDef): PipelineCapacity {
  return {
    parseConcurrency: maxParseForPipeline(def),
    liveEnqueue: true,
    historicalBackfill: true,
  };
}

function doneMinCapacity(): PipelineCapacity {
  return {
    parseConcurrency: Math.max(1, envInt("BACKFILL_DONE_PARSE_MIN", 1, 1, 4)),
    liveEnqueue: false,
    historicalBackfill: false,
  };
}

/** Safe boot defaults — research/politicians finish first; avoid full static caps before DB refresh. */
let capacityById = new Map<BackfillPipelineId, PipelineCapacity>(
  PIPELINES.map((p) => [
    p.id,
    p.id === "research" || p.id === "politicians" ? doneMinCapacity() : staticCapacity(p),
  ]),
);

export function getPipelineCapacity(id: BackfillPipelineId): PipelineCapacity {
  return capacityById.get(id) ?? staticCapacity(pipelineById.get(id)!);
}

async function loadPipelineStatus(def: PipelineDef): Promise<PipelineBackfillStatus> {
  const minDate = effectiveBackfillMinDate();

  if (def.usesSecDaily) {
    const cursor = await getIngestCursor(def.ingestPipeline, "sec_daily");
    const cursorDate = parseYyyymmdd(cursor);
    if (!cursorDate) {
      return {
        id: def.id,
        done: false,
        daysRemaining: backfillMaxAgeDays(),
        maxParse: maxParseForPipeline(def),
        weightMultiplier: def.weightMultiplier,
      };
    }
    const done = cursorDate.getTime() <= minDate.getTime();
    return {
      id: def.id,
      done,
      daysRemaining: done ? 0 : calendarDaysBetween(cursorDate, minDate),
      maxParse: maxParseForPipeline(def),
      weightMultiplier: def.weightMultiplier,
    };
  }

  const ageDays = backfillMaxAgeDays();
  const done = (await getIngestCursor(def.ingestPipeline, "historical_done")) === String(ageDays);
  return {
    id: def.id,
    done,
    daysRemaining: done ? 0 : backfillMaxAgeDays(),
    maxParse: maxParseForPipeline(def),
    weightMultiplier: def.weightMultiplier,
  };
}

function capacitySignature(map: Map<BackfillPipelineId, PipelineCapacity>): string {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, c]) => `${id}:${c.parseConcurrency}/${c.liveEnqueue ? 1 : 0}/${c.historicalBackfill ? 1 : 0}`)
    .join("|");
}

async function refreshCapacity(): Promise<void> {
  const statuses = await Promise.all(PIPELINES.map((p) => loadPipelineStatus(p)));
  const next = computeBackfillCapacity(statuses);
  const prevSig = capacitySignature(capacityById);
  const nextSig = capacitySignature(next);
  capacityById = next;

  if (prevSig !== nextSig) {
    const active = statuses.filter((s) => !s.done).map((s) => `${s.id}:${s.daysRemaining}d`);
    const done = statuses.filter((s) => s.done).map((s) => s.id);
    const alloc = [...next.entries()]
      .map(([id, c]) => `${id}=parse:${c.parseConcurrency} live:${c.liveEnqueue ? 1 : 0} backfill:${c.historicalBackfill ? 1 : 0}`)
      .join(" ");
    console.log(
      `[backfill-capacity] updated active=[${active.join(", ")}] done=[${done.join(", ")}] ${alloc}`,
    );
  }
}

/** Load cursor-based allocation before workers start — avoids restart with full static caps starving the pool. */
export async function bootstrapBackfillCapacity(opts?: { timeoutMs?: number }): Promise<void> {
  if (!backfillDynamicCapacityEnabled()) return;

  const timeoutMs = Math.max(5_000, opts?.timeoutMs ?? 45_000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await runWithWorkerDb(refreshCapacity);
      console.log("[backfill-capacity] bootstrap ok");
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[backfill-capacity] bootstrap retry", msg);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  console.warn("[backfill-capacity] bootstrap timeout — continuing with boot defaults");
}

export function startBackfillCapacityAllocator(): { stop(): void } {
  if (!backfillDynamicCapacityEnabled()) {
    console.log("[backfill-capacity] disabled (BACKFILL_DYNAMIC_CAPACITY=0 or BACKFILL_ENABLED=0)");
    return { stop() {} };
  }

  const refreshMs = Math.max(30_000, envInt("BACKFILL_CAPACITY_REFRESH_MS", 120_000, 30_000, 600_000));
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    void runWithWorkerDb(refreshCapacity).catch((e) => console.error("[backfill-capacity] refresh_failed", e));
  };

  console.log(`[backfill-capacity] enabled refreshMs=${refreshMs}`);
  const timer = setInterval(tick, refreshMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
