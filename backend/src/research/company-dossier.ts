import type http from "node:http";
import { sendJson } from "../core/http.js";
import { getCompanySnapshot } from "../core/company.js";
import { getCompanyFullCached } from "../core/ticker-context-cache.js";
import { buildCompanyExplorePayload } from "./api.js";

/**
 * Company open in ONE response: explore shell + company meta/fundamentals.
 * Bars + analyse stay separate (heavy / optional).
 */
export async function handleCompanyDossier(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }

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

  sendJson(res, 200, {
    ok: true,
    ticker: t,
    explore,
    company,
  });
}
