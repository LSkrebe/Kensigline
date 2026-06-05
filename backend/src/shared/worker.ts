function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type ParseNextResult = { processed: boolean; reason?: string };

export type PipelineWorkerOpts = {
  name: string;
  envPrefix: string;
  parseNext: () => Promise<ParseNextResult>;
  enqueue?: () => Promise<void>;
  /** Defaults when env unset */
  defaults?: {
    enqueueEveryMs?: number;
    parsePollMs?: number;
    parseThrottleMs?: number;
    parseConcurrency?: number;
  };
  bootstrapEnqueue?: boolean;
};

function envNum(prefix: string, key: string, fallback: number) {
  const n = Number(process.env[`${prefix}_${key}`] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/** Reusable enqueue + parse loop used by every tab pipeline worker. */
export function startPipelineWorker(opts: PipelineWorkerOpts) {
  const d = opts.defaults ?? {};
  const enqueueEveryMs = Math.max(15_000, envNum(opts.envPrefix, "ENQUEUE_INTERVAL_MS", d.enqueueEveryMs ?? 120_000));
  const parsePollMs = Math.max(2_000, envNum(opts.envPrefix, "PARSE_POLL_MS", d.parsePollMs ?? 6_000));
  const parseThrottleMs = Math.max(100, envNum(opts.envPrefix, "PARSE_THROTTLE_MS", d.parseThrottleMs ?? 1_000));
  const parseConcurrency = Math.max(
    1,
    Math.min(6, envNum(opts.envPrefix, "PARSE_CONCURRENCY", d.parseConcurrency ?? 1)),
  );

  console.log(
    `[${opts.name}] enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${parseConcurrency}`,
  );

  let stopped = false;
  let enqueueTimer: ReturnType<typeof setInterval> | undefined;

  if (opts.enqueue) {
    const runEnqueue = () => opts.enqueue!().catch((e) => console.error(`[${opts.name}] enqueue_failed`, e));
    if (opts.bootstrapEnqueue !== false) void runEnqueue();
    enqueueTimer = setInterval(() => {
      if (stopped) return;
      void runEnqueue();
    }, enqueueEveryMs);
  }

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      for (;;) {
        if (stopped) return;
        try {
          const r = await opts.parseNext();
          if (r.processed === false && r.reason === "no_work") await sleep(parsePollMs);
          else await sleep(parseThrottleMs);
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
    },
  };
}
