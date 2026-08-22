import type http from "node:http";
import { sendJson } from "../core/http.js";
import { buildExploreDirectoryEvents, buildExploreRecapDayPayload } from "./recap-day.js";

const EXPLORE_HOME_CACHE_TTL_MS = Math.max(
  30_000,
  Math.min(300_000, Number(process.env.EXPLORE_HOME_CACHE_MS ?? 90_000) || 90_000),
);

type CacheEntry<T> = { at: number; payload: T };

let recapCache: CacheEntry<Awaited<ReturnType<typeof buildExploreRecapDayPayload>>> | null = null;
let directoryCache: CacheEntry<Awaited<ReturnType<typeof buildExploreDirectoryEvents>>> | null = null;

function readCache<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at >= EXPLORE_HOME_CACHE_TTL_MS) return null;
  return entry.payload;
}

export async function handleExploreRecap(res: http.ServerResponse) {
  try {
    const cached = readCache(recapCache);
    if (cached) {
      sendJson(res, 200, cached);
      return;
    }
    const payload = await buildExploreRecapDayPayload();
    recapCache = { at: Date.now(), payload };
    sendJson(res, 200, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/recap]", msg);
    sendJson(res, 500, { ok: false, error: "explore_recap_failed", message: msg });
  }
}

export async function handleExploreDirectory(res: http.ServerResponse) {
  try {
    const cached = readCache(directoryCache);
    if (cached) {
      sendJson(res, 200, { ok: true, ...cached });
      return;
    }
    const payload = await buildExploreDirectoryEvents();
    directoryCache = { at: Date.now(), payload };
    sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/directory]", msg);
    sendJson(res, 500, { ok: false, error: "explore_directory_failed", message: msg });
  }
}
