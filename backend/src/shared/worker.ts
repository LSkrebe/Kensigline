import { runWithWorkerDb, runWithWorkerDbBackfill } from "../core/db.js";
import { computeAdaptiveWalkTrickle } from "./backfill-trickle.js";
import {
  backfillDynamicCapacityEnabled,
  backfillParseSlotMax,
  getPipelineCapacity,
  type BackfillPipelineId,
} from "./backfill-capacity.js";
import { countReadyQueue, readyQueueAbove } from "./queue-pending.js";
import { runWithBackfillTickMode } from "./sec-daily-backfill.js";
import { reclaimStaleParsing, requeueTransientDead } from "./queue.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type ParseNextResult = { processed: boolean; reason?: string };

export type PipelineWorkerOpts = {
  name: string;
  envPrefix: string;
  /** When set, parse/live/backfill capacity may be redistributed while historical backfill runs. */
  backfillPipelineId?: BackfillPipelineId;
  parseNext: () => Promise<ParseNextResult>;
  enqueue?: () => Promise<void>;
  /** When the parse queue is empty, run historical backfill (one step per call). */
  enqueueBackfill?: () => Promise<void>;
  /** Source types used to detect an idle queue before backfill. */
  sourceTypes?: string[];
  /** Defaults when env unset */
  defaults?: {
    enqueueEveryMs?: number;
    parsePollMs?: number;
    parseThrottleMs?: number;
    parseConcurrency?: number;
    backfillIntervalMs?: number;
  };
  bootstrapEnqueue?: boolean;
};

function envNum(prefix: string, key: string, fallback: number) {
  const n = Number(process.env[`${prefix}_${key}`] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function queueLowWater(prefix: string): number {
  return Math.max(
    0,
    envNum(prefix, "BACKFILL_QUEUE_LOW_WATER", Number(process.env.BACKFILL_QUEUE_LOW_WATER ?? 80) || 80),
  );
}

/** Hard stop — above this, backfill pauses entirely. Between low and high: walk-only ticks. */
function queueHighWater(prefix: string): number {
  const low = queueLowWater(prefix);
  const global = Number(process.env.BACKFILL_QUEUE_HIGH_WATER ?? 0);
  const prefixed = Number(process.env[`${prefix}_BACKFILL_QUEUE_HIGH_WATER`] ?? 0);
  const raw = Number.isFinite(prefixed) && prefixed > 0 ? prefixed : global;
  if (Number.isFinite(raw) && raw > low) return Math.floor(raw);
  return low + 800;
}

function liveEnqueueGated(prefix: string): boolean {
  return String(process.env[`${prefix}_ENQUEUE_GATE_LIVE`] ?? process.env.ENQUEUE_GATE_LIVE ?? "1").trim() !== "0";
}

function pipelinePoolIdle(id: BackfillPipelineId): boolean {
  const c = getPipelineCapacity(id);
  return !c.liveEnqueue && !c.historicalBackfill;
}

/**
 * High-throughput pipeline worker.
 * Parallelism = sum of PARSE_CONCURRENCY (HTTP/SEC in flight).
 * Postgres checkouts are capped separately via WORKER_QUERY_CONCURRENCY in db.ts.
 */
export function startPipelineWorker(opts: PipelineWorkerOpts) {
  const d = opts.defaults ?? {};
  const enqueueEveryMs = Math.max(5_000, envNum(opts.envPrefix, "ENQUEUE_INTERVAL_MS", d.enqueueEveryMs ?? 120_000));
  const parsePollMs = Math.max(200, envNum(opts.envPrefix, "PARSE_POLL_MS", d.parsePollMs ?? 6_000));
  const parseThrottleMs = Math.max(0, envNum(opts.envPrefix, "PARSE_THROTTLE_MS", d.parseThrottleMs ?? 750));
  const configuredParseConcurrency = Math.max(
    1,
    Math.min(16, envNum(opts.envPrefix, "PARSE_CONCURRENCY", d.parseConcurrency ?? 1)),
  );
  const dynamicCapacity = backfillDynamicCapacityEnabled() && opts.backfillPipelineId != null;
  const parseLoopCount = dynamicCapacity ? backfillParseSlotMax() : configuredParseConcurrency;
  const backfillIntervalMs = Math.max(
    2_000,
    envNum(opts.envPrefix, "BACKFILL_INTERVAL_MS", d.backfillIntervalMs ?? 60_000),
  );
  const reclaimEveryMs = Math.max(60_000, envNum(opts.envPrefix, "RECLAIM_INTERVAL_MS", 5 * 60_000));
  const reclaimOlderMinutes = Math.max(5, envNum(opts.envPrefix, "RECLAIM_STALE_MINUTES", 30));

  console.log(
    `[${opts.name}] enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${configuredParseConcurrency} parseLoops=${parseLoopCount} dynamicCapacity=${dynamicCapacity ? 1 : 0} backfillIntervalMs=${backfillIntervalMs}`,
  );

  let stopped = false;
  let enqueueTimer: ReturnType<typeof setInterval> | undefined;
  let reclaimTimer: ReturnType<typeof setInterval> | undefined;
  let backfillTimer: ReturnType<typeof setInterval> | undefined;
  let lastBackfillAt = 0;
  let backfillRunning = false;
  let backfillFailStreak = 0;
  let backfillBackoffMs = 0;

  function isPoolBlip(err: unknown): boolean {
    const msg = String(err instanceof Error ? err.message : err);
    return /ECHECKOUTTIMEOUT|authentication did not complete|connection terminated|08006/i.test(msg);
  }

  const runReclaim = () => {
    if (dynamicCapacity && opts.backfillPipelineId && pipelinePoolIdle(opts.backfillPipelineId)) return;
    return runWithWorkerDbBackfill(() =>
      Promise.all([
        reclaimStaleParsing({ olderThanMinutes: reclaimOlderMinutes }),
        requeueTransientDead({ limit: 25 }),
      ]),
    )
      .then(([stale, requeued]) => {
        if (stale > 0) console.warn(`[${opts.name}] reclaimed_stale_parsing count=${stale}`);
        if (requeued > 0) console.warn(`[${opts.name}] requeued_transient_dead count=${requeued}`);
      })
      .catch((e) => console.error(`[${opts.name}] reclaim_failed`, e));
  };

  void runReclaim();
  reclaimTimer = setInterval(() => {
    if (stopped) return;
    void runReclaim();
  }, reclaimEveryMs);

  const maybeRunBackfill = async () => {
    if (stopped || !opts.enqueueBackfill || !opts.sourceTypes?.length) return;
    if (dynamicCapacity && opts.backfillPipelineId && pipelinePoolIdle(opts.backfillPipelineId)) return;
    if (dynamicCapacity && opts.backfillPipelineId && !getPipelineCapacity(opts.backfillPipelineId).historicalBackfill) {
      return;
    }
    // Single-flight includes the low-water probe — 12 parse workers must not
    // stampede COUNT/LIMIT probes through the transaction pooler.
    if (backfillRunning) return;
    const waitMs = backfillIntervalMs + backfillBackoffMs;
    if (Date.now() - lastBackfillAt < waitMs) return;

    backfillRunning = true;
    lastBackfillAt = Date.now();
    try {
      const lowWater = queueLowWater(opts.envPrefix);
      const highWater = queueHighWater(opts.envPrefix);
      const ready = await runWithWorkerDbBackfill(() => countReadyQueue(opts.sourceTypes!));
      if (ready >= highWater) return;

      const walkOnly = ready > lowWater;
      const walkTrickle = walkOnly
        ? computeAdaptiveWalkTrickle({ ready, lowWater, highWater })
        : undefined;

      await runWithWorkerDbBackfill(() =>
        runWithBackfillTickMode(
          { walkOnly, ...(walkTrickle !== undefined ? { walkTrickle } : {}) },
          () => opts.enqueueBackfill!(),
        ),
      );
      backfillFailStreak = 0;
      backfillBackoffMs = 0;
    } catch (e) {
      console.error(`[${opts.name}] backfill_failed`, e);
      if (isPoolBlip(e)) {
        backfillFailStreak += 1;
        backfillBackoffMs = Math.min(120_000, backfillIntervalMs * 2 ** Math.min(backfillFailStreak, 4));
        console.warn(`[${opts.name}] backfill_backoff_ms=${backfillBackoffMs} streak=${backfillFailStreak}`);
      }
    } finally {
      backfillRunning = false;
    }
  };

  // Independent of parse success — under pooler blips parse loops error before
  // reaching maybeRunBackfill, which previously froze historical cursors forever.
  if (opts.enqueueBackfill) {
    const runBackfillTick = () => {
      void maybeRunBackfill().catch((e) => console.error(`[${opts.name}] backfill_tick_failed`, e));
    };
    runBackfillTick();
    backfillTimer = setInterval(() => {
      if (stopped) return;
      runBackfillTick();
    }, backfillIntervalMs);
  }

  if (opts.enqueue) {
    let lastLiveSkipLog = 0;
    const runEnqueue = async () => {
      try {
        if (dynamicCapacity && opts.backfillPipelineId && !getPipelineCapacity(opts.backfillPipelineId).liveEnqueue) {
          return;
        }
        if (opts.sourceTypes?.length && liveEnqueueGated(opts.envPrefix)) {
          const lowWater = queueLowWater(opts.envPrefix);
          const above = await runWithWorkerDb(() => readyQueueAbove(opts.sourceTypes!, lowWater));
          if (above) {
            const now = Date.now();
            if (now - lastLiveSkipLog > 60_000) {
              console.log(`[${opts.name}] live_enqueue_skipped ready_above_low_water=${lowWater}`);
              lastLiveSkipLog = now;
            }
            return;
          }
        }
        await runWithWorkerDb(() => opts.enqueue!());
      } catch (e) {
        console.error(`[${opts.name}] enqueue_failed`, e);
      }
    };
    if (opts.bootstrapEnqueue !== false) void runEnqueue();
    enqueueTimer = setInterval(() => {
      if (stopped) return;
      void runEnqueue();
    }, enqueueEveryMs);
  }

  for (let w = 0; w < parseLoopCount; w++) {
    (async () => {
      // Tiny stagger so claim storms don't all hit the pooler on the same tick.
      await sleep(w * 40);
      for (;;) {
        if (stopped) return;
        if (dynamicCapacity && opts.backfillPipelineId) {
          const effective = getPipelineCapacity(opts.backfillPipelineId).parseConcurrency;
          if (w >= effective) {
            await sleep(parsePollMs);
            continue;
          }
        }
        try {
          const r = await runWithWorkerDb(() => opts.parseNext());
          if (r.processed === false && r.reason === "no_work") {
            await maybeRunBackfill();
            await sleep(parsePollMs);
          } else {
            // Top up the queue while parsers are busy (low-water backfill).
            void maybeRunBackfill().catch((e) => console.error(`[${opts.name}] backfill_tick_failed`, e));
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error(`[${opts.name}] parse_loop_failed`, e);
          void maybeRunBackfill().catch((e) => console.error(`[${opts.name}] backfill_tick_failed`, e));
          await sleep(2_000);
        }
      }
    })().catch((e) => console.error(`[${opts.name}] parse_loop_outer_failed`, e));
  }

  return {
    stop() {
      stopped = true;
      if (enqueueTimer) clearInterval(enqueueTimer);
      if (reclaimTimer) clearInterval(reclaimTimer);
      if (backfillTimer) clearInterval(backfillTimer);
    },
  };
}
