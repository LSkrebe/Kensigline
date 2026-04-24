import { enqueueCurrentFilingFeed } from "./sec.js";
import { parseNextPharmaQueueItem } from "./pharma.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startPharmaWorker() {
  const enqueueEveryMs = Math.max(30_000, Number(process.env.PHARMA_ENQUEUE_INTERVAL_MS ?? 60_000));
  const pagesPerMinute = Math.max(1, Math.min(20, Number(process.env.PHARMA_FEED_PAGES_PER_MIN ?? 3)));
  const pagesPerMinuteCatchup = Math.max(1, Math.min(20, Number(process.env.PHARMA_FEED_PAGES_PER_MIN_CATCHUP ?? 6)));
  const parsePollMs = Math.max(2_000, Number(process.env.PHARMA_PARSE_POLL_MS ?? 6_000));
  const parseThrottleMs = Math.max(100, Number(process.env.PHARMA_PARSE_THROTTLE_MS ?? 1200));
  const parseConcurrency = Math.max(1, Math.min(4, Number(process.env.PHARMA_PARSE_CONCURRENCY ?? 1)));

  console.log(
    `Pharma worker: current filings pages/min=${pagesPerMinute} catchup=${pagesPerMinuteCatchup} enqueueEveryMs=${enqueueEveryMs} parseConcurrency=${parseConcurrency}`,
  );

  let stopped = false;

  const enqueueTimer = setInterval(() => {
    if (stopped) return;
    (async () => {
      const pages = process.env.PHARMA_CATCHUP === "1" ? pagesPerMinuteCatchup : pagesPerMinute;
      const forms = ["8-K", "10-Q", "10-K"];
      for (const f of forms) {
        try {
          await enqueueCurrentFilingFeed({ formType: f, pages, pageSize: 100, sourceType: "sec_pharma_filing", priority: 5 });
        } catch (e) {
          console.error("pharma_enqueue_failed", f, e);
        }
      }
    })().catch((e) => console.error("pharma_enqueue_loop_failed", e));
  }, enqueueEveryMs);

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      for (;;) {
        if (stopped) return;
        try {
          const r = await parseNextPharmaQueueItem();
          if ((r as any)?.processed === false && (r as any)?.reason === "no_work") {
            await sleep(parsePollMs);
          } else {
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error("pharma_parse_loop_failed", e);
          await sleep(2_000);
        }
      }
    })().catch((e) => console.error("pharma_parse_loop_outer_failed", e));
  }

  function stop() {
    stopped = true;
    clearInterval(enqueueTimer);
  }

  return { stop };
}

