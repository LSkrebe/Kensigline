import { runWithWorkerDb, withWorkerLane } from "../core/db.js";
import { countPendingQueue } from "./queue-pending.js";
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
 * Cross-pipeline cap on in-flight parseNext calls.
 * Prevents stampeding the Supabase transaction pooler while still allowing
 * HTTP/SEC I/O without holding the DB job gate.
 */
const parseGlobalLimit = Math.max(
  1,
  Math.min(48, Number(process.env.PARSE_GLOBAL_CONCURRENCY ?? 6) || 6),
);
let parseInFlight = 0;
const parseWaiters: Array<() => void> = [];

async function acquireParseSlot(): Promise<void> {
  if (parseInFlight < parseGlobalLimit) {
    parseInFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => parseWaiters.push(resolve));
  parseInFlight += 1;
}

function releaseParseSlot(): void {
  parseInFlight = Math.max(0, parseInFlight - 1);
  const next = parseWaiters.shift();
  if (next) next();
}

async function withParseSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireParseSlot();
  try {
    return await fn();
  } finally {
    releaseParseSlot();
  }
}

/** Reusable enqueue + parse loop used by every tab pipeline worker. */
export function startPipelineWorker(opts: PipelineWorkerOpts) {
  const d = opts.defaults ?? {};
  const unthrottled = String(process.env.WORKER_DB_UNTHROTTLED ?? "").trim() === "1";
  const enqueueEveryMs = Math.max(15_000, envNum(opts.envPrefix, "ENQUEUE_INTERVAL_MS", d.enqueueEveryMs ?? 120_000));
  const parsePollMs = Math.max(1_000, envNum(opts.envPrefix, "PARSE_POLL_MS", d.parsePollMs ?? 6_000));
  const parseThrottleMs = Math.max(
    0,
    envNum(opts.envPrefix, "PARSE_THROTTLE_MS", d.parseThrottleMs ?? (unthrottled ? 50 : 1_000)),
  );
  const parseConcurrency = Math.max(
    1,
    Math.min(24, envNum(opts.envPrefix, "PARSE_CONCURRENCY", d.parseConcurrency ?? 1)),
  );
  const backfillIntervalMs = Math.max(
    unthrottled ? 5_000 : 10_000,
    envNum(opts.envPrefix, "BACKFILL_INTERVAL_MS", d.backfillIntervalMs ?? 60_000),
  );
  const reclaimEveryMs = Math.max(60_000, envNum(opts.envPrefix, "RECLAIM_INTERVAL_MS", 3 * 60_000));
  const reclaimOlderMinutes = Math.max(5, envNum(opts.envPrefix, "RECLAIM_STALE_MINUTES", 10));

  console.log(
    `[${opts.name}] enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${parseConcurrency} backfillIntervalMs=${backfillIntervalMs} unthrottled=${unthrottled ? 1 : 0} parseGlobalLimit=${parseGlobalLimit}`,
  );

  let stopped = false;
  let enqueueTimer: ReturnType<typeof setInterval> | undefined;
  let reclaimTimer: ReturnType<typeof setInterval> | undefined;
  let lastBackfillAt = 0;
  let backfillRunning = false;
  let pressureBackoffMs = 0;

  const isDbPressure = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    return /timeout exceeded when trying to connect|ECHECKOUTTIMEOUT|ECHECKOUTRETRIES|authentication did not complete|too many clients|remaining connection slots/i.test(
      msg,
    );
  };

  const runReclaim = () =>
    runWithWorkerDb(() =>
      Promise.all([
        reclaimStaleParsing({ olderThanMinutes: reclaimOlderMinutes }),
        requeueTransientDead({ limit: unthrottled ? 400 : 80 }),
      ]),
    )
      .then(([stale, requeued]) => {
        if (stale > 0) console.warn(`[${opts.name}] reclaimed_stale_parsing count=${stale}`);
        if (requeued > 0) console.warn(`[${opts.name}] requeued_transient_dead count=${requeued}`);
      })
      .catch((e) => console.error(`[${opts.name}] reclaim_failed`, e));

  const reclaimBootDelay = 5_000 + Math.floor(Math.random() * 20_000);
  const reclaimBootTimer = setTimeout(() => {
    if (stopped) return;
    void runReclaim();
  }, reclaimBootDelay);
  reclaimTimer = setInterval(() => {
    if (stopped) return;
    void runReclaim();
  }, reclaimEveryMs);

  const maybeRunBackfill = async () => {
    if (stopped || !opts.enqueueBackfill || !opts.sourceTypes?.length) return;
    if (backfillRunning) return;
    if (Date.now() - lastBackfillAt < backfillIntervalMs) return;

    const pending = await runWithWorkerDb(() => countPendingQueue(opts.sourceTypes!));
    const pendingGate = unthrottled ? 80 : 0;
    if (pending > pendingGate) return;

    backfillRunning = true;
    lastBackfillAt = Date.now();
    try {
      await runWithWorkerDb(() => opts.enqueueBackfill!());
    } catch (e) {
      console.error(`[${opts.name}] backfill_failed`, e);
      if (isDbPressure(e)) pressureBackoffMs = Math.min(60_000, Math.max(8_000, pressureBackoffMs * 2 || 8_000));
    } finally {
      backfillRunning = false;
    }
  };

  if (opts.enqueue) {
    const runEnqueue = () =>
      runWithWorkerDb(() => opts.enqueue!()).catch((e) => {
        console.error(`[${opts.name}] enqueue_failed`, e);
        if (isDbPressure(e)) pressureBackoffMs = Math.min(60_000, Math.max(8_000, pressureBackoffMs * 2 || 8_000));
      });
    if (opts.bootstrapEnqueue !== false) {
      const bootDelay = 2_000 + Math.floor(Math.random() * 25_000);
      setTimeout(() => {
        if (!stopped) void runEnqueue();
      }, bootDelay);
    }
    enqueueTimer = setInterval(() => {
      if (stopped) return;
      void runEnqueue();
    }, enqueueEveryMs);
  }

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      await sleep(unthrottled ? 200 + w * 150 : 1_000 + w * 750 + Math.floor(Math.random() * 4_000));
      for (;;) {
        if (stopped) return;
        if (pressureBackoffMs > 0) {
          const wait = pressureBackoffMs;
          pressureBackoffMs = Math.floor(pressureBackoffMs * 0.7);
          if (pressureBackoffMs < 2_000) pressureBackoffMs = 0;
          await sleep(wait);
        }
        try {
          const r = await withParseSlot(() => withWorkerLane(() => opts.parseNext()));
          if (r.processed === false && r.reason === "no_work") {
            await maybeRunBackfill();
            await sleep(parsePollMs);
          } else {
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error(`[${opts.name}] parse_loop_failed`, e);
          if (isDbPressure(e)) {
            pressureBackoffMs = Math.min(60_000, Math.max(10_000, pressureBackoffMs * 2 || 10_000));
            await sleep(pressureBackoffMs);
          } else {
            await sleep(2_000);
          }
        }
      }
    })().catch((e) => console.error(`[${opts.name}] parse_loop_outer_failed`, e));
  }

  return {
    stop() {
      stopped = true;
      clearTimeout(reclaimBootTimer);
      if (enqueueTimer) clearInterval(enqueueTimer);
      if (reclaimTimer) clearInterval(reclaimTimer);
    },
  };
}
