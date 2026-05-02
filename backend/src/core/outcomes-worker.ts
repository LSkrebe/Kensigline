import { recomputeInsiderOutcomes, recomputePharmaOutcomes } from "./outcomes.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startOutcomesWorker() {
  let stopped = false;
  let running = false;

  const intervalMs = Math.max(60_000, Number(process.env.OUTCOMES_RECOMPUTE_INTERVAL_MS ?? 6 * 60 * 60 * 1000));

  async function loop() {
    while (!stopped) {
      if (!running) {
        running = true;
        try {
          await recomputeInsiderOutcomes();
          await recomputePharmaOutcomes();
        } catch (e) {
          // Keep the worker alive; outcomes are best-effort.
          console.error("[outcomes-worker]", e);
        } finally {
          running = false;
        }
      }
      await sleep(intervalMs);
    }
  }

  loop();

  return {
    stop() {
      stopped = true;
    },
  };
}

