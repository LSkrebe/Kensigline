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

  const cached = await readCompanyDossierCache(t);
  if (cached?.ok && cached.explore && cached.company) {
    sendJson(res, 200, cached);
    // Soft refresh in background so ingest catches up without blocking open.
    scheduleCompanyDossierRefresh(t, buildCompanyDossierPayload);
    return;
  }

  const payload = await buildCompanyDossierPayload(t);
  void writeCompanyDossierCache(t, payload).catch(() => {});
  sendJson(res, 200, payload);
}
