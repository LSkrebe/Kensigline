import assert from "node:assert/strict";
import { computeBackfillCapacity } from "./backfill-capacity-alloc.js";
import {
  effectiveParseSlotMax,
  effectiveQueueHighWater,
  effectiveQueueLowWater,
  ingestMode,
  liveEnqueuePermitted,
} from "./ingest-mode.js";

export function runIngestModeTests() {
  delete process.env.INGEST_MODE;
  delete process.env.LIVE_ENQUEUE_ENABLED;
  process.env.BACKFILL_LIVE_ENQUEUE = "0";
  process.env.BACKFILL_SCHEDULE = "parallel";
  process.env.BACKFILL_MAX_AGE_DAYS = "365";
  assert.equal(ingestMode(), "backfill");
  assert.equal(liveEnqueuePermitted(), false);

  process.env.INGEST_MODE = "drain";
  assert.equal(ingestMode(), "drain");
  assert.equal(liveEnqueuePermitted(), false);
  assert.equal(effectiveParseSlotMax(), 20);

  process.env.INGEST_MODE = "catchup";
  process.env.BACKFILL_SCHEDULE = "sequential";
  process.env.BACKFILL_MAX_AGE_DAYS = "30";
  assert.equal(ingestMode(), "catchup");
  assert.ok(effectiveQueueLowWater("INSTITUTIONS") <= 150);
  assert.ok(effectiveQueueHighWater("INSTITUTIONS") <= 900);

  const catchupSeq = computeBackfillCapacity([
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
    { id: "insider", done: false, daysRemaining: 30, maxParse: 10, weightMultiplier: 1 },
    { id: "institutions", done: false, daysRemaining: 30, maxParse: 10, weightMultiplier: 1 },
  ]);
  assert.equal(catchupSeq.get("institutions")?.parseConcurrency, 10);
  assert.equal(catchupSeq.get("institutions")?.liveEnqueue, false);

  process.env.INGEST_MODE = "live";
  process.env.LIVE_ENQUEUE_ENABLED = "1";
  assert.equal(liveEnqueuePermitted(), true);
  assert.equal(effectiveParseSlotMax(), 6);

  const liveDone = computeBackfillCapacity([
    { id: "insider", done: true, daysRemaining: 0, maxParse: 8, weightMultiplier: 1 },
    { id: "institutions", done: true, daysRemaining: 0, maxParse: 10, weightMultiplier: 1 },
    { id: "research", done: true, daysRemaining: 0, maxParse: 6, weightMultiplier: 1 },
    { id: "politicians", done: true, daysRemaining: 0, maxParse: 4, weightMultiplier: 1 },
  ]);
  assert.equal(liveDone.get("institutions")?.parseConcurrency, 6);
  assert.equal(liveDone.get("institutions")?.liveEnqueue, true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestModeTests();
  console.log("[ingest-mode] ok");
}
