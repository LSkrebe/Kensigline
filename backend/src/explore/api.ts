import type http from "node:http";
import { sendJson } from "../core/http.js";
import { buildExploreDirectoryEvents, buildExploreRecapDayPayload } from "./recap-day.js";

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
type HomePayload = { recap: RecapPayload; directory: DirectoryPayload };

type CacheEntry<T> = { at: number; payload: T };

let homeCache: CacheEntry<HomePayload> | null = null;
let homeBuildChain: Promise<HomePayload> | null = null;
let homeRefreshScheduled = false;

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
}

/** Recap + directory are independent query sets — build in parallel for faster cold cache. */
async function buildExploreHomePayload(): Promise<HomePayload> {
  const [recap, directory] = await Promise.all([
    buildExploreRecapDayPayload(),
    buildExploreDirectoryEvents(),
  ]);
  return { recap, directory };
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
    companyEvents: payload.directory.companyEvents,
    investorEvents: payload.directory.investorEvents,
  };
}

export async function handleExploreHome(res: http.ServerResponse) {
  try {
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
  if (readFresh(homeCache) || homeBuildChain) return;
  console.log("[explore/home] prewarm_start");
  void getExploreHomeFresh()
    .then(() => console.log("[explore/home] prewarm_ok"))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[explore/home] prewarm_failed", msg);
    });
}
