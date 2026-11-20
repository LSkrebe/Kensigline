/**
 * Smoke: ensureDDL + insert session/events into previous Vilnius day + query stats.
 * Usage: npx tsx src/scripts/smoke-attribution-analytics.ts
 */
import "../load-env.js";
import { previousVilniusDayWindow } from "../attribution/tz.js";
import {
  insertAnalyticsEvents,
  landingDayStats,
  landingFunnelLeaks,
  landingSectionViews,
  landingSourceEngagement,
  upsertAnalyticsSession,
} from "../attribution/store.js";

async function main() {
  const { start, end, label, timeZone } = previousVilniusDayWindow();
  console.log("[smoke] window", { label, timeZone, start: start.toISOString(), end: end.toISOString() });

  const visitorId = "test-visitor-analytics-001";
  const sessionId = "test-session-analytics-001";
  const mid = new Date(start.getTime() + 60 * 60 * 1000);

  await upsertAnalyticsSession({
    id: sessionId,
    visitorId,
    ref: "yt",
    startedAt: mid,
    endedAt: new Date(mid.getTime() + 120_000),
    durationMs: 120_000,
    activeMs: 90_000,
    maxScrollPct: 75,
    device: "desktop",
    landingPath: "/",
    referrerHost: "youtube.com",
    utmSource: "youtube",
    utmMedium: "video",
    utmCampaign: "test",
  });

  const inserted = await insertAnalyticsEvents([
    { visitorId, sessionId, ref: "yt", event: "scroll_milestone", meta: { pct: "25" }, createdAt: mid },
    { visitorId, sessionId, ref: "yt", event: "scroll_milestone", meta: { pct: "50" }, createdAt: mid },
    { visitorId, sessionId, ref: "yt", event: "scroll_milestone", meta: { pct: "75" }, createdAt: mid },
    { visitorId, sessionId, ref: "yt", event: "section_viewed", meta: { section: "pricing" }, createdAt: mid },
    { visitorId, sessionId, ref: "yt", event: "section_viewed", meta: { section: "product" }, createdAt: mid },
    { visitorId, sessionId, ref: "yt", event: "buy_clicked", meta: { location: "pricing", plan: "yearly" }, createdAt: mid },
  ]);
  const dup = await insertAnalyticsEvents([
    { visitorId, sessionId, ref: "yt", event: "scroll_milestone", meta: { pct: "75" }, createdAt: mid },
  ]);

  const stats = await landingDayStats(start, end);
  const leaks = await landingFunnelLeaks(start, end);
  const sections = await landingSectionViews(start, end);
  const sources = await landingSourceEngagement(start, end);

  console.log("[smoke] inserted", inserted, "dup", dup);
  console.log("[smoke] stats", stats);
  console.log("[smoke] leaks", leaks);
  console.log("[smoke] sections", sections);
  console.log("[smoke] sources", sources.slice(0, 5));

  if (stats.sessions < 1) throw new Error("expected_sessions");
  if (stats.pricing_views < 1) throw new Error("expected_pricing_views");
  if (stats.buy_clicks < 1) throw new Error("expected_buy_clicks");
  if (dup !== 0) throw new Error("expected_scroll_dedupe");
  console.log("[smoke] OK");
}

main().catch((err) => {
  console.error("[smoke] fatal", err);
  process.exitCode = 1;
});
