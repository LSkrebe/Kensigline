import type http from "node:http";
import { sendJson } from "../core/http.js";
import { getCompanySnapshot } from "../core/company.js";
import { getCompanyFullCached } from "../core/ticker-context-cache.js";
import {
  readCompanyDossierCache,
  scheduleCompanyDossierRefresh,
  writeCompanyDossierCache,
} from "../core/dossier-cache.js";
import { buildCompanyExplorePayload } from "./api.js";

/** Live-build company fat dossier (also used to populate Postgres cache). */
export async function buildCompanyDossierPayload(ticker: string): Promise<Record<string, unknown>> {
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase();
  if (!t) return { ok: false, error: "ticker_required" };

  let explore: Record<string, unknown>;
  try {
    explore = await buildCompanyExplorePayload(t);
  } catch (err) {
    console.error("company_dossier_explore_failed", t, err);
    explore = {
      ok: false,
      error: "explore_failed",
      ticker: t,
      company_name: t,
      presentation: { title: t, subtitle: t, blocks: [], explainer: [], sources: [], documents: [] },
      flows: { insiders: [], politicians: [], filings13f: [] },
      tracked_investors: [],
    };
  }

  let company: Record<string, unknown> | null = null;
  try {
    company = await getCompanyFullCached({ ticker: t });
  } catch (err) {
    console.warn("company_dossier_full_failed", t, err);
    try {
      company = await getCompanySnapshot({ ticker: t });
    } catch {
      company = { ticker: t, name: explore.company_name ?? t };
    }
  }

  return {
    ok: true,
    ticker: t,
    explore,
    company,
  };
}

const responseCache = new Map<string, {at: number; payload: Record<string, unknown>}>();
const pendingResponses = new Map<string, Promise<Record<string, unknown>>>();

async function companyResponse(t: string): Promise<Record<string, unknown>> {
  const hit = responseCache.get(t);
  if (hit && Date.now() - hit.at < 30_000) return hit.payload;
  const pending = pendingResponses.get(t);
  if (pending) return pending;
  const request = (async () => {
    const cached = await readCompanyDossierCache(t);
    if (cached?.ok && cached.explore && cached.company) {
      scheduleCompanyDossierRefresh(t, buildCompanyDossierPayload);
      return cached;
    }
    const payload = await buildCompanyDossierPayload(t);
    void writeCompanyDossierCache(t, payload).catch(() => {});
    return payload;
  })();
  pendingResponses.set(t, request);
  try {
    const payload = await request;
    if (payload.ok && (payload.explore as {ok?: boolean})?.ok !== false) {
      if (responseCache.size >= 100) responseCache.delete(responseCache.keys().next().value!);
      responseCache.set(t, {at: Date.now(), payload});
    }
    return payload;
  } finally { pendingResponses.delete(t); }
}

/**
 * Company open: prefer materialized cache, rebuild in background when missing/stale-path.
 */
export async function handleCompanyDossier(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }

  sendJson(res, 200, await companyResponse(t));
}
