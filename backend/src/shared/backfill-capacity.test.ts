import assert from "node:assert/strict";
import {
  backfillWeightMode,
  computeBackfillCapacity,
  type PipelineBackfillStatus,
} from "./backfill-capacity-alloc.js";

export function runBackfillCapacityTests() {
  process.env.BACKFILL_PARSE_BUDGET_TOTAL = "26";
  process.env.BACKFILL_DONE_PARSE_MIN = "1";
  process.env.BACKFILL_PARSE_SLOT_MAX = "16";
  process.env.BACKFILL_WEIGHT_MODE = "short_first";

  const current: PipelineBackfillStatus[] = [
    { id: "insider", done: false, daysRemaining: 229, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 348, maxParse: 6, weightMultiplier: 1 },
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
  ];

  const alloc = computeBackfillCapacity(current);
  assert.equal(alloc.get("research")?.parseConcurrency, 1);
  assert.equal(alloc.get("research")?.liveEnqueue, false);
  assert.equal(alloc.get("politicians")?.historicalBackfill, false);

  const insider = alloc.get("insider")!.parseConcurrency;
  const institutions = alloc.get("institutions")!.parseConcurrency;
  assert.equal(insider + institutions, 24);
  assert.ok(insider > institutions);
  assert.equal(insider, 15);
  assert.equal(institutions, 9);

  const insiderDone: PipelineBackfillStatus[] = [
    { id: "insider", done: true, daysRemaining: 0, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 348, maxParse: 6, weightMultiplier: 1 },
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
  ];
  const solo = computeBackfillCapacity(insiderDone);
  assert.equal(solo.get("insider")?.parseConcurrency, 1);
  assert.equal(solo.get("institutions")?.parseConcurrency, 16);

  process.env.BACKFILL_WEIGHT_MODE = "days";
  const daysMode = computeBackfillCapacity(current);
  assert.equal(daysMode.get("insider")!.parseConcurrency, 9);
  assert.equal(daysMode.get("institutions")!.parseConcurrency, 15);

  assert.equal(backfillWeightMode(), "days");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillCapacityTests();
  console.log("[backfill-capacity] ok");
}
