import {
  recomputeResearchOutcomes,
  recomputeInsiderOutcomes,
  recomputePharmaOutcomes,
  recomputePoliticiansOutcomes,
} from "./outcomes.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readOutcomesJobOpts() {
  const maxTickers = Math.max(10, Number(process.env.OUTCOMES_MAX_TICKERS ?? 500));
  const lookbackDays = Math.max(30, Number(process.env.OUTCOMES_LOOKBACK_DAYS ?? 365));
  const enablePoliticians = String(process.env.OUTCOMES_ENABLE_POLITICIANS ?? "1").trim() !== "0";
  const enableResearch =
    String(process.env.OUTCOMES_ENABLE_RESEARCH ?? process.env.OUTCOMES_ENABLE_BOSHA ?? "1").trim() !== "0";
  return { lookbackDays, maxTickers, enablePoliticians, enableResearch };
}

/** One full outcomes pass (Research tab trend charts read `outcomes` snapshots). */
export async function runOutcomesRecomputeOnce(opts?: {
  lookbackDays?: number;
  maxTickers?: number;
  enablePoliticians?: boolean;
  enableResearch?: boolean;
}) {
  const d = readOutcomesJobOpts();
  const lookbackDays = opts?.lookbackDays ?? d.lookbackDays;
  const maxTickers = opts?.maxTickers ?? d.maxTickers;
  const enablePoliticians = opts?.enablePoliticians ?? d.enablePoliticians;
  const enableResearch = opts?.enableResearch ?? d.enableResearch;
  await recomputeInsiderOutcomes({ lookbackDays, maxTickers });
  await recomputePharmaOutcomes({ lookbackDays, maxTickers });
  if (enablePoliticians) await recomputePoliticiansOutcomes({ lookbackDays, maxTickers });
  if (enableResearch) await recomputeResearchOutcomes({ lookbackDays, maxTickers });
}

export function startOutcomesWorker() {
  let stopped = false;
  let running = false;

  const intervalMs = Math.max(60_000, Number(process.env.OUTCOMES_RECOMPUTE_INTERVAL_MS ?? 6 * 60 * 60 * 1000));
  const { lookbackDays, maxTickers, enablePoliticians, enableResearch } = readOutcomesJobOpts();

  async function loop() {
    while (!stopped) {
      if (!running) {
        running = true;
        try {
          await runOutcomesRecomputeOnce({ lookbackDays, maxTickers, enablePoliticians, enableResearch });
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
