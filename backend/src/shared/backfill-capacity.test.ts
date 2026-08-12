import assert from "node:assert/strict";
import { computeBackfillCapacity, type PipelineBackfillStatus } from "./backfill-capacity-alloc.js";

export function runBackfillCapacityTests() {
  process.env.BACKFILL_PARSE_BUDGET_TOTAL = "26";
  process.env.BACKFILL_DONE_PARSE_MIN = "1";
  process.env.BACKFILL_PARSE_SLOT_MAX = "16";

  const current: PipelineBackfillStatus[] = [
    { id: "insider", done: false, daysRemaining: 231, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 348, maxParse: 6, weightMultiplier: 1.5 },
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
  assert.equal(institutions, 16);
  assert.equal(insider, 8);

  process.env.BACKFILL_PARSE_BUDGET_TOTAL = "12";
  const expanded: PipelineBackfillStatus[] = [
    { id: "insider", done: true, daysRemaining: 0, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 50, maxParse: 6, weightMultiplier: 1.5 },
    { id: "research", done: false, daysRemaining: 100, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
  ];
  const next = computeBackfillCapacity(expanded);
  assert.equal(next.get("research")?.historicalBackfill, true);
  assert.equal(next.get("research")?.liveEnqueue, true);
  assert.equal(next.get("insider")?.parseConcurrency, 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillCapacityTests();
  console.log("[backfill-capacity] ok");
}
