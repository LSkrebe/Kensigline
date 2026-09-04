import type http from "node:http";
import { sendJson } from "../core/http.js";
import {
  ensureExplorePerfIndexes,
  readExploreHomeSnapshot,
  writeExploreHomeSnapshot,
} from "./home-snapshot.js";
import { buildExploreDirectoryEvents, buildExploreRecapDayPayload } from "./recap-day.js";
import { buildExploreWatchlistLatest } from "./watchlist.js";
import { evaluateRecapForHome, type EvaluatedRecapHome } from "./recap-evaluate-home.js";

const EXPLORE_HOME_CACHE_TTL_MS = Math.max(
  60_000,
  Math.min(600_000, Number(process.env.EXPLORE_HOME_CACHE_MS ?? 300_000) || 300_000),
);

type RecapPayload = Awaited<ReturnType<typeof buildExploreRecapDayPayload>>;
type DirectoryPayload = Awaited<ReturnType<typeof buildExploreDirectoryEvents>>;
type HomePayload = {
  recap: RecapPayload;
  directory: DirectoryPayload;
  recapEvaluated: EvaluatedRecapHome | null;
  watchlistLatest: Awaited<ReturnType<typeof buildExploreWatchlistLatest>>;
};

type CacheEntry<T> = { at: number; payload: T };

let homeCache: CacheEntry<HomePayload> | null = null;
let homeBuildChain: Promise<HomePayload> | null = null;
let homeRefreshScheduled = false;
let snapshotHydrateChain: Promise<void> | null = null;
let periodicRefreshTimer: ReturnType<typeof setInterval> | null = null;

function readFresh<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at >= EXPLORE_HOME_CACHE_TTL_MS) return null;
  return entry.payload;
}

/** Any in-memory payload — never expire for serving; background refresh when not fresh. */
function readServeable<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  return entry.payload;
}

function cacheIsFresh(entry: CacheEntry<unknown> | null): boolean {
  if (!entry) return false;
  return Date.now() - entry.at < EXPLORE_HOME_CACHE_TTL_MS;
}

function writeHomeCache(payload: HomePayload) {
  homeCache = { at: Date.now(), payload };
  void writeExploreHomeSnapshot(payload).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[explore/home] snapshot_write_failed", msg);
  });
}

function payloadFromSnapshot(raw: {
  recap: unknown;
  directory: unknown;
  recapEvaluated: unknown;
}): HomePayload | null {
  if (!raw.recap || !raw.directory) return null;
  return {
    recap: raw.recap as RecapPayload,
    directory: raw.directory as DirectoryPayload,
    recapEvaluated: (raw.recapEvaluated as EvaluatedRecapHome | null) ?? null,
    watchlistLatest: Array.isArray((raw as { watchlistLatest?: unknown }).watchlistLatest)
      ? ((raw as { watchlistLatest?: HomePayload["watchlistLatest"] }).watchlistLatest ?? [])
      : [],
  };
}

/** Hydrate in-memory cache from Postgres on cold boot — any snapshot age. */
async function hydrateFromDurableSnapshot(): Promise<void> {
  if (snapshotHydrateChain) return snapshotHydrateChain;

  snapshotHydrateChain = (async () => {
    try {
      if (homeCache) return;
      const row = await readExploreHomeSnapshot();
      if (!row) return;
      const payload = payloadFromSnapshot(row.payload);
      if (!payload) return;
      homeCache = { at: row.at, payload };
      console.log("[explore/home] snapshot_hydrated", {
        age_ms: Date.now() - row.at,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[explore/home] snapshot_hydrate_failed", msg);
    } finally {
      snapshotHydrateChain = null;
    }
  })();

  return snapshotHydrateChain;
}

/** Recap + directory are independent query sets — build in parallel for faster cold cache. */
async function buildExploreHomePayload(): Promise<HomePayload> {
  const [recap, directory, watchlistLatest] = await Promise.all([
    buildExploreRecapDayPayload(),
    buildExploreDirectoryEvents(),
    buildExploreWatchlistLatest(),
  ]);
  const recapEvaluated = await evaluateRecapForHome(recap as Record<string, unknown>);
  return { recap, directory, recapEvaluated, watchlistLatest };
}

async function getExploreHomeFresh(): Promise<HomePayload> {
  if (homeBuildChain) return homeBuildChain;

  homeBuildChain = (async () => {
    try {
      const payload = await buildExploreHomePayload();
      writeHomeCache(payload);
      return payload;
    } finally {
      homeBuildChain = null;
    }
  })();

  return homeBuildChain;
}

function scheduleExploreHomeRefresh() {
  if (homeRefreshScheduled || homeBuildChain) return;
  homeRefreshScheduled = true;
  void getExploreHomeFresh()
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[explore/home] background_refresh_failed", msg);
    })
    .finally(() => {
      homeRefreshScheduled = false;
    });
}

function homeJson(payload: HomePayload, meta: { cached?: boolean; stale?: boolean } = {}) {
  return {
    ok: true,
    cached: meta.cached === true,
    stale: meta.stale === true,
    recap: payload.recap,
    recapEvaluated: payload.recapEvaluated,
    companyEvents: payload.directory.companyEvents,
    investorEvents: payload.directory.investorEvents,
    watchlistEvents: payload.watchlistLatest,
  };
}

async function resolveServeableHome(): Promise<{ payload: HomePayload; fresh: boolean } | null> {
  await hydrateFromDurableSnapshot();
  const freshPayload = readFresh(homeCache);
  if (freshPayload) return { payload: freshPayload, fresh: true };
  const serveable = readServeable(homeCache);
  if (serveable) return { payload: serveable, fresh: false };
  return null;
}

export type ExploreHomeCacheMeta = {
  ageMs: number | null;
  fresh: boolean;
  stale: boolean;
  building: boolean;
};

export function getExploreHomeCacheMeta(): ExploreHomeCacheMeta {
  const entry = homeCache;
  if (!entry) {
    return { ageMs: null, fresh: false, stale: false, building: homeBuildChain != null };
  }
  const ageMs = Math.max(0, Date.now() - entry.at);
  return {
    ageMs,
    fresh: ageMs < EXPLORE_HOME_CACHE_TTL_MS,
    stale: ageMs >= EXPLORE_HOME_CACHE_TTL_MS,
    building: homeBuildChain != null,
  };
}

export async function handleExploreHome(res: http.ServerResponse) {
  try {
    const hit = await resolveServeableHome();
    if (hit) {
      sendJson(res, 200, homeJson(hit.payload, hit.fresh ? { cached: true } : { stale: true }));
      if (!hit.fresh) scheduleExploreHomeRefresh();
      return;
    }

    const payload = await getExploreHomeFresh();
    sendJson(res, 200, homeJson(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/home]", msg);
    sendJson(res, 500, { ok: false, error: "explore_home_failed", message: msg });
  }
}

export async function handleExploreRecap(res: http.ServerResponse) {
  try {
    const hit = await resolveServeableHome();
    if (hit) {
      sendJson(res, 200, hit.payload.recap);
      if (!hit.fresh) scheduleExploreHomeRefresh();
      return;
    }
    const payload = await getExploreHomeFresh();
    sendJson(res, 200, payload.recap);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/recap]", msg);
    sendJson(res, 500, { ok: false, error: "explore_recap_failed", message: msg });
  }
}

export async function handleExploreDirectory(res: http.ServerResponse) {
  try {
    const hit = await resolveServeableHome();
    if (hit) {
      sendJson(res, 200, {
        ok: true,
        ...hit.payload.directory,
        watchlistEvents: hit.payload.watchlistLatest ?? [],
      });
      if (!hit.fresh) scheduleExploreHomeRefresh();
      return;
    }
    const payload = await getExploreHomeFresh();
    sendJson(res, 200, {
      ok: true,
      ...payload.directory,
      watchlistEvents: payload.watchlistLatest ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/directory]", msg);
    sendJson(res, 500, { ok: false, error: "explore_directory_failed", message: msg });
  }
}

function startExploreHomePeriodicRefresh() {
  if (periodicRefreshTimer) return;
  periodicRefreshTimer = setInterval(() => {
    if (cacheIsFresh(homeCache)) return;
    scheduleExploreHomeRefresh();
  }, EXPLORE_HOME_CACHE_TTL_MS);
  periodicRefreshTimer.unref?.();
}

/** Warm explore home after boot so first visitor isn't paying cold-query cost. */
export function prewarmExploreHome() {
  void ensureExplorePerfIndexes();
  startExploreHomePeriodicRefresh();

  void hydrateFromDurableSnapshot()
    .then(() => {
      if (cacheIsFresh(homeCache)) {
        console.log("[explore/home] prewarm_skip_fresh");
        return;
      }
      if (readServeable(homeCache)) {
        console.log("[explore/home] prewarm_stale_ready");
        scheduleExploreHomeRefresh();
        return;
      }
      if (homeBuildChain) return;
      console.log("[explore/home] prewarm_start");
      return getExploreHomeFresh()
        .then(() => console.log("[explore/home] prewarm_ok"))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[explore/home] prewarm_failed", msg);
        });
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[explore/home] prewarm_hydrate_failed", msg);
    });
}
