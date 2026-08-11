import { runWithWorkerDb } from "../core/db.js";
import { countReadyQueue } from "./queue-pending.js";
import { reclaimStaleParsing, requeueTransientDead } from "./queue.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type ParseNextResult = { processed: boolean; reason?: string };

export type PipelineWorkerOpts = {
  name: string;
  envPrefix: string;
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
  const parseConcurrency = Math.max(
    1,
    Math.min(16, envNum(opts.envPrefix, "PARSE_CONCURRENCY", d.parseConcurrency ?? 1)),
  );
  const backfillIntervalMs = Math.max(
    2_000,
    envNum(opts.envPrefix, "BACKFILL_INTERVAL_MS", d.backfillIntervalMs ?? 60_000),
  );
  const reclaimEveryMs = Math.max(60_000, envNum(opts.envPrefix, "RECLAIM_INTERVAL_MS", 5 * 60_000));
  const reclaimOlderMinutes = Math.max(5, envNum(opts.envPrefix, "RECLAIM_STALE_MINUTES", 30));

  console.log(
    `[${opts.name}] enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${parseConcurrency} backfillIntervalMs=${backfillIntervalMs}`,
  );

  let stopped = false;
  let enqueueTimer: ReturnType<typeof setInterval> | undefined;
  let reclaimTimer: ReturnType<typeof setInterval> | undefined;
  let lastBackfillAt = 0;
  let backfillRunning = false;

  const runReclaim = () =>
    runWithWorkerDb(() =>
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

  void runReclaim();
  reclaimTimer = setInterval(() => {
    if (stopped) return;
    void runReclaim();
  }, reclaimEveryMs);

  const maybeRunBackfill = async () => {
    if (stopped || !opts.enqueueBackfill || !opts.sourceTypes?.length) return;
    if (backfillRunning) return;
    if (Date.now() - lastBackfillAt < backfillIntervalMs) return;

    const pending = await runWithWorkerDb(() => countReadyQueue(opts.sourceTypes!));
    // Keep the parse queue fed — waiting for empty causes starve/fill cycles.
    const lowWater = Math.max(
      0,
      envNum(opts.envPrefix, "BACKFILL_QUEUE_LOW_WATER", Number(process.env.BACKFILL_QUEUE_LOW_WATER ?? 80) || 80),
    );
    if (pending > lowWater) return;

    backfillRunning = true;
    lastBackfillAt = Date.now();
    try {
      await runWithWorkerDb(() => opts.enqueueBackfill!());
    } catch (e) {
      console.error(`[${opts.name}] backfill_failed`, e);
    } finally {
      backfillRunning = false;
    }
  };

  if (opts.enqueue) {
    const runEnqueue = () =>
      runWithWorkerDb(() => opts.enqueue!()).catch((e) => console.error(`[${opts.name}] enqueue_failed`, e));
    if (opts.bootstrapEnqueue !== false) void runEnqueue();
    enqueueTimer = setInterval(() => {
      if (stopped) return;
      void runEnqueue();
    }, enqueueEveryMs);
  }

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      // Tiny stagger so claim storms don't all hit the pooler on the same tick.
      await sleep(w * 40);
      for (;;) {
        if (stopped) return;
        try {
          const r = await runWithWorkerDb(() => opts.parseNext());
          if (r.processed === false && r.reason === "no_work") {
            await maybeRunBackfill();
            await sleep(parsePollMs);
          } else {
            // Top up the queue while parsers are busy (low-water backfill).
            void maybeRunBackfill();
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error(`[${opts.name}] parse_loop_failed`, e);
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
    },
  };
}
