import { db } from "./db.js";
import { listHousePtrPdfsWithRetry } from "./house.js";
import { parseNextPoliticiansQueueItem } from "./politicians.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startPoliticiansWorker() {
  const enqueueEveryMs = Math.max(30_000, Number(process.env.POLITICIANS_ENQUEUE_INTERVAL_MS ?? 180_000));
  const parsePollMs = Math.max(2_000, Number(process.env.POLITICIANS_PARSE_POLL_MS ?? 5_000));
  const parseThrottleMs = Math.max(100, Number(process.env.POLITICIANS_PARSE_THROTTLE_MS ?? 500));
  const parseConcurrency = Math.max(1, Math.min(6, Number(process.env.POLITICIANS_PARSE_CONCURRENCY ?? 2)));
  const maxPerPoll = Math.max(10, Math.min(2000, Number(process.env.POLITICIANS_MAX_PER_POLL ?? 400)));

  console.log(
    `Politicians worker: House PTR poll every=${enqueueEveryMs}ms maxPerPoll=${maxPerPoll} parseConcurrency=${parseConcurrency}`,
  );

  let stopped = false;

  async function enqueueHousePtrs() {
    const year = new Date().getFullYear();
    const rows = await listHousePtrPdfsWithRetry({ filingYear: year, max: maxPerPoll });
    if (!rows.length) return;

    // Insert new URLs into queue; unique index on url prevents duplicates.
    let enq = 0;
    for (const r of rows) {
      try {
        await db.query(
          `
          INSERT INTO document_queue (url, source_type, status, priority, updated_at)
          VALUES ($1, 'house_ptr', 'ready_to_parse', 0, now())
          ON CONFLICT (url) DO NOTHING
          `,
          [r.pdf_url],
        );
        enq++;
      } catch {
        // ignore
      }
    }
    console.log(`politicians_enqueue_house_ptrs year=${year} discovered=${rows.length} attempted=${enq}`);
  }

  const enqueueTimer = setInterval(() => {
    if (stopped) return;
    enqueueHousePtrs().catch((e) => console.error("politicians_enqueue_failed", e));
  }, enqueueEveryMs);

  // run once on startup
  enqueueHousePtrs().catch((e) => console.error("politicians_enqueue_failed_startup", e));

  for (let w = 0; w < parseConcurrency; w++) {
    (async () => {
      for (;;) {
        if (stopped) return;
        try {
          const r = await parseNextPoliticiansQueueItem();
          if ((r as any)?.processed === false && (r as any)?.reason === "no_work") {
            await sleep(parsePollMs);
          } else {
            await sleep(parseThrottleMs);
          }
        } catch (e) {
          console.error("politicians_parse_loop_failed", e);
          await sleep(2_000);
        }
      }
    })().catch((e) => console.error("politicians_parse_loop_outer_failed", e));
  }

  function stop() {
    stopped = true;
    clearInterval(enqueueTimer);
  }

  return { stop };
}

