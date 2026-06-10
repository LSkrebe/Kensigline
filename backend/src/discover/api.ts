import type http from "node:http";
import { route, sendJson } from "../core/http.js";
import { clampInt } from "../shared/feed-helpers.js";
import { parseSourceKeyFilterParam } from "../shared/source-keys.js";
import { buildDiscoverTimeline } from "./timeline.js";

export async function tryDiscoverRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (route(req, url, "GET", "/api/discover/timeline")) {
    const query = String(url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();
    const pastDays = clampInt(url.searchParams.get("past_days"), 7, 365, 90);
    const aheadDays = clampInt(url.searchParams.get("ahead_days"), 7, 365, 180);
    const limit = clampInt(url.searchParams.get("limit"), 10, 500, 120);
    const sourcesParam = url.searchParams.get("sources") ?? url.searchParams.get("source_keys");
    const macroDays = clampInt(url.searchParams.get("macro_days"), 1, 14, 5);
    const sourceKeys =
      sourcesParam != null && String(sourcesParam).trim()
        ? parseSourceKeyFilterParam(sourcesParam)
        : null;

    try {
      const payload = await buildDiscoverTimeline({
        query,
        sourceKeys,
        pastDays,
        aheadDays,
        limit,
        macroDays,
      });
      sendJson(res, 200, payload);
    } catch (e) {
      console.error("discover_timeline_failed", e);
      sendJson(res, 502, { ok: false, error: "discover_timeline_failed" });
    }
    return true;
  }

  return false;
}
