import { enqueueBoshaSecFilings, enqueueBoshaWebFeeds } from "./ingest.js";
import { parseNextBoshaQueueItem } from "./parse.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startBoshaWorker() {
  const enqueueEveryMs = Math.max(60_000, Number(process.env.BOSHA_ENQUEUE_INTERVAL_MS ?? 180_000));
  const pages = Math.max(1, Math.min(20, Number(process.env.BOSHA_FEED_PAGES ?? 3)));
  const parsePollMs = Math.max(2_000, Number(process.env.BOSHA_PARSE_POLL_MS ?? 8_000));
  const parseThrottleMs = Math.max(200, Number(process.env.BOSHA_PARSE_THROTTLE_MS ?? 2_000));
  const parseConcurrency = Math.max(1, Math.min(3, Number(process.env.BOSHA_PARSE_CONCURRENCY ?? 1)));

  console.log(
    `Bosha worker: enqueueEveryMs=${enqueueEveryMs} pages=${pages} parseConcurrency=${parseConcurrency}`,
  );

  let stopped = false;

  void (async () => {
    try {
      await enqueueBoshaSecFilings({ pages });
      await enqueueBoshaWebFeeds();
    } catch (e) {
      console.error("bosha_bootstrap_enqueue_failed", e);
    }
  })();

  const enqueueTimer = setInterval(() => {
    if (stopped) return;
    (async () => {
      try {
        await enqueueBoshaSecFilings({ pages });
        await enqueueBoshaWebFeeds();
      } catch (e) {
        console.error("bosha_enqueue_failed", e);
      }
    })().catch((e) => console.error("bosha_enqueue_loop_failed", e));
  }, enqueueEveryMs);

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      for (;;) {
        if (stopped) return;
        try {
          const r = await parseNextBoshaQueueItem();
          if ((r as any)?.processed === false && (r as any)?.reason === "no_work") {
            await sleep(parsePollMs);
          } else {
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error("bosha_parse_loop_failed", e);
          await sleep(2_000);
        }
      }
    })().catch((e) => console.error("bosha_parse_loop_outer_failed", e));
  }

  function stop() {
    stopped = true;
    clearInterval(enqueueTimer);
  }

  return { stop };
}
