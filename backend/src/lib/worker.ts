import { enqueueCurrentForm4Feed } from "./sec.js";
import { parseNextInsiderQueueItem } from "./insider.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startInsiderWorker() {
  const enqueueEveryMs = Math.max(15_000, Number(process.env.INSIDER_ENQUEUE_INTERVAL_MS ?? 60_000));
  const pagesPerMinute = Math.max(1, Math.min(20, Number(process.env.INSIDER_FEED_PAGES_PER_MIN ?? 7)));
  const pagesPerMinuteCatchup = Math.max(1, Math.min(20, Number(process.env.INSIDER_FEED_PAGES_PER_MIN_CATCHUP ?? 12)));
  const parsePollMs = Math.max(2_000, Number(process.env.INSIDER_PARSE_POLL_MS ?? 5_000));
  const parseThrottleMs = Math.max(100, Number(process.env.INSIDER_PARSE_THROTTLE_MS ?? 750));
  const parseConcurrency = Math.max(1, Math.min(6, Number(process.env.INSIDER_PARSE_CONCURRENCY ?? 3)));

  console.log(
    `Insider worker: current Form 4 feed pages/min=${pagesPerMinute} catchup=${pagesPerMinuteCatchup} enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${parseConcurrency}`,
  );

  let stopped = false;

  // Enqueue loop: poll SEC "current filings" feed for Form 4s.
  const enqueueTimer = setInterval(() => {
    if (stopped) return;
    (async () => {
      try {
        // Catch-up: pull more pages if backlog exists.
        const pages = process.env.INSIDER_CATCHUP === "1" ? pagesPerMinuteCatchup : pagesPerMinute;
        await enqueueCurrentForm4Feed({ pages, pageSize: 100 });
      } catch (e) {
        console.error("enqueue_current_form4_feed_failed", e);
      }
    })().catch((e) => console.error("enqueue_loop_failed", e));
  }, enqueueEveryMs);

  // Parse loop: drain queue with limited concurrency.
  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      for (;;) {
        if (stopped) return;
        try {
          const r = await parseNextInsiderQueueItem();
          if ((r as any)?.processed === false && (r as any)?.reason === "no_work") {
            await sleep(parsePollMs);
          } else {
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error("parse_loop_failed", e);
          await sleep(2_000);
        }
      }
    })().catch((e) => console.error("parse_loop_outer_failed", e));
  }

  function stop() {
    stopped = true;
    clearInterval(enqueueTimer);
  }

  return { stop };
}

