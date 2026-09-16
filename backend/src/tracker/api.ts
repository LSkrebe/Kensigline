import type http from "node:http";
import { db } from "../core/db.js";
import { sendJson, json } from "../core/http.js";
import {
  bearerToken,
  verifySupabaseAccessToken,
} from "../core/supabase-auth.js";
import {
  activity,
  people,
  category,
  actorBySlug,
  actorEvents,
} from "./data.js";
import { analyzeOutcomes, type PriceBar } from "./outcomes.js";
import { queueDisclosurePriceRefresh } from "../core/disclosure-prices.js";
const cache = new Map<string, { at: number; data: any }>();
const inflight = new Map<string, Promise<any>>();
async function cached(key: string, fn: () => Promise<any>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  let p = inflight.get(key);
  if (!p) {
    p = fn()
      .then((data) => {
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: Date.now(), data });
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
export async function handleTracker(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  preview = false,
) {
  const path = url.pathname,
    params = url.searchParams;
  if (preview) {
    const data = await cached("preview", async () => {
      const groups = await Promise.all(
        (["insider", "politician", "institution"] as const).map((kind) =>
          activity({ kind, limit: 2 }),
        ),
      );
      return {
        items: groups.flatMap((g) => g.items),
        generatedAt: new Date().toISOString(),
      };
    });
    sendJson(res, 200, { ok: true, ...data });
    return;
  }
  if (req.method === "GET" && path === "/api/tracker/activity") {
    const kind = category(params.get("category")),
      ticker = params.get("ticker")?.trim().toUpperCase();
    if (ticker && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      sendJson(res, 400, { ok: false, error: "invalid_ticker" });
      return;
    }
    const result = await cached(url.pathname + url.search, () =>
      activity({
        kind,
        limit: 40,
        before: params.get("before"),
        ticker: ticker || null,
        order: params.get("order") ?? "reported",
      }),
    );
    sendJson(res, 200, { ok: true, ...result });
    return;
  }
  if (req.method === "GET" && path === "/api/tracker/people") {
    const offset = Math.min(
      100000,
      Math.max(0, Math.floor(Number(params.get("offset"))) || 0),
    );
    const result = await cached(url.pathname + url.search, () =>
      people({
        q: (params.get("q") ?? "").trim().slice(0, 80),
        kind: category(params.get("category")),
        offset,
      }),
    );
    sendJson(res, 200, {
      ok: true,
      items: result.slice(0, 30),
      hasMore: result.length > 30,
      nextOffset: offset + 30,
    });
    return;
  }
  if (
    req.method === "GET" &&
    (path === "/api/tracker/profile" || path === "/api/tracker/performance")
  ) {
    const slug = (params.get("slug") ?? "").slice(0, 120);
    const actor = await actorBySlug(slug);
    if (!actor) {
      sendJson(res, 404, { ok: false, error: "profile_not_found" });
      return;
    }
    const allEvents = await cached(`actor:${actor.id}`, () =>
      actorEvents(actor.id),
    );
    const truncated = allEvents.length > 1200;
    const events = allEvents.slice(0, 1200);
    if (path.endsWith("/profile")) {
      sendJson(res, 200, {
        ok: true,
        actor,
        events: events.slice(0, 1200),
        truncated,
        coverage: {
          recordedEvents: Math.min(events.length, 1200),
          tickers: new Set(events.map((e: any) => e.ticker)).size,
          legacyInstitutionEvents: events.filter(
            (e: any) => e.quality === "legacy_unverified",
          ).length,
        },
      });
      return;
    }
    const tickers = [
      ...new Set<string>(["SPY", ...events.map((e: any) => e.ticker)]),
    ];
    const rows = await db.queryApi<any>(
      "SELECT ticker,bars,fetched_at::text,as_of_day::text FROM disclosure_price_history WHERE ticker=ANY($1::text[])",
      [tickers],
    );
    const histories = new Map<string, PriceBar[]>(
      rows.map((r) => [r.ticker, r.bars]),
    );
    const missing = tickers.filter((t) => !histories.has(t));
    // Rate-limited background fills never delay the interactive API.
    for (const t of [
      ...missing,
      ...rows
        .filter((r) => Date.now() - Date.parse(r.fetched_at) > 6 * 3600000)
        .map((r) => r.ticker),
    ].slice(0, 40))
      queueDisclosurePriceRefresh(t);
    const result = analyzeOutcomes(events, histories, {
      clock: params.get("clock") === "reported" ? "reported" : "observed",
      horizon: Number(params.get("horizon")) || 90,
      action:
        params.get("action") ??
        (actor.category === "institution" ? "holding" : "buy"),
    });
    sendJson(res, 200, {
      ok: true,
      ...result,
      priceCoverage: {
        available: rows.length,
        requested: tickers.length,
        refreshing: missing.length > 0,
        asOf: rows.reduce(
          (a: string | null, r: any) =>
            !a || r.as_of_day < a ? r.as_of_day : a,
          null,
        ),
      },
      truncated,
    });
    return;
  }
  if (path === "/api/tracker/watchlist") {
    const token = bearerToken(req);
    const user = token ? await verifySupabaseAccessToken(token) : null;
    if (!user?.sub) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (req.method === "GET") {
      const items = await db.queryApi<any>(
        "SELECT a.id::text,a.slug,a.display_name as name,a.filer_type::text as category FROM tracker_watchlist w JOIN filers a ON a.id=w.filer_id WHERE w.user_id=$1::uuid ORDER BY w.created_at",
        [user.sub],
      );
      sendJson(res, 200, { ok: true, items });
      return;
    }
    if (req.method === "PUT" || req.method === "DELETE") {
      const body = (await json(req)) as any;
      const actor = await actorBySlug(String(body?.slug ?? "").slice(0, 120));
      if (!actor) {
        sendJson(res, 404, { ok: false, error: "profile_not_found" });
        return;
      }
      if (req.method === "DELETE")
        await db.queryApi(
          "DELETE FROM tracker_watchlist WHERE user_id=$1::uuid AND filer_id=$2::uuid",
          [user.sub, actor.id],
        );
      else {
        const saved = await db.transactionApi(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            user.sub,
          ]);
          const existing = await client.query(
            "SELECT filer_id FROM tracker_watchlist WHERE user_id=$1::uuid",
            [user.sub],
          );
          if (existing.rows.some((r: any) => r.filer_id === actor.id))
            return true;
          if (existing.rows.length >= 50) return false;
          await client.query(
            "INSERT INTO tracker_watchlist(user_id,filer_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING",
            [user.sub, actor.id],
          );
          return true;
        });
        if (!saved) {
          sendJson(res, 409, { ok: false, error: "watchlist_limit" });
          return;
        }
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }
  sendJson(res, 404, { ok: false, error: "not_found" });
}
