import type http from "node:http";
import { sendJson } from "../core/http.js";
import {
  activity,
  actorBySlug,
  actorEvents,
  category,
} from "../tracker/data.js";
import { contentApiAuthorized } from "./auth.js";
/** The distribution system consumes the same source-backed records as the product. */
export async function handleInternalContent(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  url: URL,
) {
  if (!contentApiAuthorized(req, url)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }
  if (
    pathname === "/api/internal/content/today" ||
    pathname === "/api/internal/content/events"
  ) {
    const data = await activity({
      kind: category(url.searchParams.get("category")),
      limit: Math.min(
        60,
        Math.max(1, Number(url.searchParams.get("limit")) || 30),
      ),
      ticker: url.searchParams.get("ticker")?.toUpperCase() || null,
    });
    sendJson(res, 200, {
      ok: true,
      schemaVersion: 2,
      ...data,
      events: data.items,
      filings: data.items,
      methodologyUrl: "https://mercerline.com/methodology",
      usage:
        "Use reported ranges as ranges. Stock outcomes are not personal profit. Recorded dates may reflect historical imports.",
    });
    return true;
  }
  if (pathname === "/api/internal/content/profile") {
    const actor = await actorBySlug(
      (url.searchParams.get("slug") ?? "").slice(0, 120),
    );
    if (!actor) {
      sendJson(res, 404, { ok: false, error: "profile_not_found" });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      schemaVersion: 2,
      actor,
      events: (await actorEvents(actor.id)).slice(0, 1200),
      productUrl: `https://mercerline.com/people/${encodeURIComponent(actor.slug)}`,
      methodologyUrl: "https://mercerline.com/methodology",
    });
    return true;
  }
  return false;
}
