import type http from "node:http";
import { sendJson } from "../core/http.js";
import { readExploreHomeSnapshot, writeExploreHomeSnapshot } from "./home-snapshot.js";
import { buildExploreDirectoryEvents, buildExploreRecapDayPayload } from "./recap-day.js";
import { evaluateRecapForHome, type EvaluatedRecapHome } from "./recap-evaluate-home.js";

const EXPLORE_HOME_CACHE_TTL_MS = Math.max(
  60_000,
  Math.min(600_000, Number(process.env.EXPLORE_HOME_CACHE_MS ?? 300_000) || 300_000),
);
/** Serve stale home payloads instantly while revalidating in the background. */
const EXPLORE_HOME_STALE_TTL_MS = Math.max(
  EXPLORE_HOME_CACHE_TTL_MS,
  Number(process.env.EXPLORE_HOME_STALE_MS ?? 1_800_000) || 1_800_000,
);

type RecapPayload = Awaited<ReturnType<typeof buildExploreRecapDayPayload>>;
type DirectoryPayload = Awaited<ReturnType<typeof buildExploreDirectoryEvents>>;
type HomePayload = {
  recap: RecapPayload;
  directory: DirectoryPayload;
  recapEvaluated: EvaluatedRecapHome | null;
};

type CacheEntry<T> = { at: number; payload: T };

let homeCache: CacheEntry<HomePayload> | null = null;
let homeBuildChain: Promise<HomePayload> | null = null;
let homeRefreshScheduled = false;
let snapshotHydrateChain: Promise<void> | null = null;

function readFresh<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at >= EXPLORE_HOME_CACHE_TTL_MS) return null;
  return entry.payload;
}

function readStale<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at >= EXPLORE_HOME_STALE_TTL_MS) return null;
  return entry.payload;
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
  };
}

/** Hydrate in-memory cache from Postgres on cold boot. */
async function hydrateFromDurableSnapshot(): Promise<void> {
  if (snapshotHydrateChain) return snapshotHydrateChain;

  snapshotHydrateChain = (async () => {
    try {
      if (homeCache) return;
      const row = await readExploreHomeSnapshot(EXPLORE_HOME_STALE_TTL_MS);
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
  const [recap, directory] = await Promise.all([
    buildExploreRecapDayPayload(),
    buildExploreDirectoryEvents(),
  ]);
  const recapEvaluated = await evaluateRecapForHome(recap as Record<string, unknown>);
  return { recap, directory, recapEvaluated };
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
  };
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
    stale: ageMs >= EXPLORE_HOME_CACHE_TTL_MS && ageMs < EXPLORE_HOME_STALE_TTL_MS,
    building: homeBuildChain != null,
  };
}

export async function handleExploreHome(res: http.ServerResponse) {
  try {
    await hydrateFromDurableSnapshot();

    const fresh = readFresh(homeCache);
    if (fresh) {
      sendJson(res, 200, homeJson(fresh, { cached: true }));
      return;
    }

    const stale = readStale(homeCache);
    if (stale) {
      sendJson(res, 200, homeJson(stale, { stale: true }));
      scheduleExploreHomeRefresh();
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
    await hydrateFromDurableSnapshot();

    const fresh = readFresh(homeCache);
    if (fresh) {
      sendJson(res, 200, fresh.recap);
      return;
    }
    const stale = readStale(homeCache);
    if (stale) {
      sendJson(res, 200, stale.recap);
      scheduleExploreHomeRefresh();
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
    await hydrateFromDurableSnapshot();

    const fresh = readFresh(homeCache);
    if (fresh) {
      sendJson(res, 200, { ok: true, ...fresh.directory });
      return;
    }
    const stale = readStale(homeCache);
    if (stale) {
      sendJson(res, 200, { ok: true, ...stale.directory });
      scheduleExploreHomeRefresh();
      return;
    }
    const payload = await getExploreHomeFresh();
    sendJson(res, 200, { ok: true, ...payload.directory });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/directory]", msg);
    sendJson(res, 500, { ok: false, error: "explore_directory_failed", message: msg });
  }
}

/** Warm explore home after boot so first visitor isn't paying cold-query cost. */
export function prewarmExploreHome() {
  void hydrateFromDurableSnapshot()
    .then(() => {
      if (readFresh(homeCache)) {
        console.log("[explore/home] prewarm_skip_fresh");
        return;
      }
      if (readStale(homeCache)) {
        console.log("[explore/home] prewarm_stale_served");
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
