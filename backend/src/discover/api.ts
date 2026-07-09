import type http from "node:http";
import { route, sendJson } from "../core/http.js";
import { clampInt } from "../shared/feed-helpers.js";
import { buildMacroCalendarCached } from "./macro-calendar-cache.js";

export async function tryDiscoverRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (route(req, url, "GET", "/api/macro/calendar")) {
    const days = clampInt(url.searchParams.get("days"), 1, 14, 7);

    try {
      const payload = await buildMacroCalendarCached(days);
      sendJson(res, 200, payload);
    } catch (e) {
      console.error("macro_calendar_failed", e);
      sendJson(res, 502, { ok: false, error: "macro_calendar_failed" });
    }
    return true;
  }

  return false;
}
