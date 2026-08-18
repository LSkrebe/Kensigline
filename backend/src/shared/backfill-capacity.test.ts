import assert from "node:assert/strict";
import {
  backfillScheduleMode,
  backfillWeightMode,
  computeBackfillCapacity,
  computeSequentialBackfillCapacity,
  type PipelineBackfillStatus,
} from "./backfill-capacity-alloc.js";

export function runBackfillCapacityTests() {
  process.env.BACKFILL_PARSE_BUDGET_TOTAL = "26";
  process.env.BACKFILL_DONE_PARSE_MIN = "1";
  process.env.BACKFILL_PARSE_SLOT_MAX = "16";
  process.env.BACKFILL_WEIGHT_MODE = "short_first";
  process.env.BACKFILL_LIVE_ENQUEUE = "0";
  process.env.BACKFILL_SCHEDULE = "parallel";

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
  assert.equal(alloc.get("insider")?.liveEnqueue, false);

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

  process.env.BACKFILL_SCHEDULE = "sequential";
  process.env.BACKFILL_SEQUENCE = "research,politicians,insider,institutions";
  const seq = computeSequentialBackfillCapacity([
    { id: "research", done: false, daysRemaining: 30, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
    { id: "insider", done: false, daysRemaining: 30, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 30, maxParse: 6, weightMultiplier: 1 },
  ]);
  assert.equal(seq.get("research")?.historicalBackfill, true);
  assert.equal(seq.get("research")?.parseConcurrency, 6);
  assert.equal(seq.get("research")?.liveEnqueue, false);
  assert.equal(seq.get("insider")?.historicalBackfill, false);
  assert.equal(seq.get("insider")?.parseConcurrency, 1);
  assert.equal(seq.get("institutions")?.historicalBackfill, false);
  assert.equal(seq.get("institutions")?.parseConcurrency, 1);

  assert.equal(backfillScheduleMode(), "sequential");

  process.env.INGEST_MODE = "catchup";
  process.env.BACKFILL_SEQUENCE = "institutions,research,politicians,insider";
  const catchupParseDrain = computeSequentialBackfillCapacity([
    { id: "institutions", done: true, daysRemaining: 0, maxParse: 8, weightMultiplier: 1, backlogReady: 500 },
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1, backlogReady: 100 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1, backlogReady: 0 },
    { id: "insider", done: true, daysRemaining: 0, maxParse: 10, weightMultiplier: 1, backlogReady: 50 },
  ]);
  assert.equal(catchupParseDrain.get("institutions")?.parseConcurrency, 8);
  assert.equal(catchupParseDrain.get("research")?.parseConcurrency, 1);
  assert.equal(catchupParseDrain.get("insider")?.parseConcurrency, 1);

  const allDone: PipelineBackfillStatus[] = [
    { id: "insider", done: true, daysRemaining: 0, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
  ];
  process.env.BACKFILL_SCHEDULE = "parallel";
  const drain = computeBackfillCapacity(allDone);
  assert.equal(drain.get("institutions")?.parseConcurrency, 6);
  assert.equal(drain.get("institutions")?.liveEnqueue, false);
  assert.equal(drain.get("insider")?.parseConcurrency, 10);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillCapacityTests();
  console.log("[backfill-capacity] ok");
}
